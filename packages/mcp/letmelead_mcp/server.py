"""MCP server exposing LetMeLead to Claude, Codex, Cursor or any MCP client.

Transport: Streamable HTTP at /mcp (SSE also mounted at /sse), or stdio for desktop
clients. Authentication is per request: the caller's API key selects the tenant, and
every tool call is executed by the REST API with that same key.
"""

from __future__ import annotations

import asyncio
import contextvars
import json
import logging
import os
import time
from typing import Any

import httpx
from mcp.server.mcpserver import MCPServer
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

from .api_client import ApiError, LetMeLeadClient

logger = logging.getLogger("letmelead_mcp")

API_URL = os.getenv("LETMELEAD_API_URL", "http://localhost:8000")
_current_key: contextvars.ContextVar[str | None] = contextvars.ContextVar("api_key", default=None)
_validation_cache: dict[str, tuple[float, dict[str, Any]]] = {}
CACHE_TTL = 60.0


async def validate_key(key: str) -> dict[str, Any] | None:
    """Ask the API whether this key is valid. Cached briefly to keep tool calls fast."""
    cached = _validation_cache.get(key)
    now = time.time()
    if cached and now - cached[0] < CACHE_TTL:
        return cached[1]
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.get(f"{API_URL}/v1/tenant", headers={"X-API-Key": key})
        if res.status_code != 200:
            return None
        tenant = res.json()
        _validation_cache[key] = (now, tenant)
        return tenant
    except httpx.HTTPError:
        return None


class ApiKeyMiddleware:
    """ASGI middleware: 401 without a valid key, and expose the key to tool calls."""

    def __init__(self, app, exempt_paths: tuple[str, ...] = ("/health",)) -> None:
        self.app = app
        self.exempt = exempt_paths

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["path"] in self.exempt:
            return await self.app(scope, receive, send)

        headers = {k.decode().lower(): v.decode() for k, v in scope.get("headers", [])}
        key = headers.get("x-api-key")
        if not key:
            auth = headers.get("authorization", "")
            key = auth[7:].strip() if auth.lower().startswith("bearer ") else None
        if not key:
            return await self._reject(send, "missing_api_key", "Send X-API-Key or Authorization: Bearer.")

        tenant = await validate_key(key)
        if tenant is None:
            return await self._reject(send, "invalid_api_key", "The API key is invalid or revoked.")

        token = _current_key.set(key)
        try:
            await self.app(scope, receive, send)
        finally:
            _current_key.reset(token)

    @staticmethod
    async def _reject(send, code: str, message: str):
        body = json.dumps({"error": {"code": code, "message": message}}).encode()
        await send(
            {
                "type": "http.response.start",
                "status": 401,
                "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())],
            }
        )
        await send({"type": "http.response.body", "body": body})


def _client() -> LetMeLeadClient:
    key = _current_key.get() or os.getenv("LETMELEAD_API_KEY")
    if not key:
        raise RuntimeError("No API key in this request. Send X-API-Key.")
    return LetMeLeadClient(base_url=API_URL, api_key=key)


def _ok(payload: Any) -> dict[str, Any]:
    return {"ok": True, "data": payload}


def _fail(exc: Exception) -> dict[str, Any]:
    if isinstance(exc, ApiError):
        return exc.as_dict()
    logger.exception("mcp_tool_failed")
    return {"ok": False, "error": {"code": "internal_error", "message": str(exc)[:300], "details": {}}}


server = MCPServer(
    name="letmelead",
    version="1.0.0",
    instructions=(
        "Lead generation with evidence. Call get_credits first, then find_leads, then show each lead's "
        "reason and signal age before claim_lead. Never claim or send without the user's explicit approval."
    ),
)


@server.tool(description="Run the signal engine and return freshly qualified leads.")
async def find_leads(sources: list[str] | None = None, limit_targets: int = 50) -> dict[str, Any]:
    try:
        client = _client()
        result = await client.scan(sources=sources, wait=True, limit_targets=limit_targets)
        leads = await client.leads(limit=25, status="new")
        return _ok({"scan": result, "leads": leads.get("items", [])})
    except Exception as exc:  # noqa: BLE001
        return _fail(exc)


@server.tool(description="List ranked leads with reason, signal age, fit and contact state.")
async def list_leads(
    limit: int = 25,
    status: str | None = None,
    fit: str | None = None,
    min_score: float | None = None,
    query: str | None = None,
) -> dict[str, Any]:
    try:
        return _ok(await _client().leads(limit=limit, status=status, fit=fit, min_score=min_score, q=query))
    except Exception as exc:  # noqa: BLE001
        return _fail(exc)


@server.tool(description="Full lead detail with evidence, source URLs and qualification notes.")
async def get_lead(lead_id: str) -> dict[str, Any]:
    try:
        return _ok(await _client().lead(lead_id))
    except Exception as exc:  # noqa: BLE001
        return _fail(exc)


@server.tool(description="Claim a lead with credits. First 10 per workspace are free.")
async def claim_lead(lead_id: str, idempotency_key: str | None = None) -> dict[str, Any]:
    try:
        return _ok(await _client().claim(lead_id, idempotency_key))
    except Exception as exc:  # noqa: BLE001
        return _fail(exc)


@server.tool(description="Reject a lead with a reason; the reason trains future qualification.")
async def mark_not_fit(lead_id: str, reason: str) -> dict[str, Any]:
    try:
        return _ok(await _client().not_fit(lead_id, reason))
    except Exception as exc:  # noqa: BLE001
        return _fail(exc)


@server.tool(description="Create a campaign with the default signal-led sequence.")
async def create_campaign(name: str, lead_ids: list[str] | None = None) -> dict[str, Any]:
    try:
        return _ok(await _client().create_campaign(name, lead_ids))
    except Exception as exc:  # noqa: BLE001
        return _fail(exc)


@server.tool(description="Pause a campaign immediately.")
async def pause_campaign(campaign_id: str, reason: str | None = None) -> dict[str, Any]:
    try:
        return _ok(await _client().pause(campaign_id, reason))
    except Exception as exc:  # noqa: BLE001
        return _fail(exc)


@server.tool(description="Queue and send what is due for a campaign, respecting daily caps.")
async def send_outreach(campaign_id: str, lead_ids: list[str] | None = None) -> dict[str, Any]:
    try:
        client = _client()
        queued = await client.queue(campaign_id, lead_ids) if lead_ids else None
        sent = await client.send(campaign_id)
        return _ok({"queued": queued, "send": sent})
    except Exception as exc:  # noqa: BLE001
        return _fail(exc)


@server.tool(description="Replies from leads, newest first.")
async def list_replies(limit: int = 25, unread_only: bool = False) -> dict[str, Any]:
    try:
        return _ok(await _client().replies(limit=limit, unread_only=unread_only))
    except Exception as exc:  # noqa: BLE001
        return _fail(exc)


@server.tool(description="Credit balance, free-lead allowance and spend report.")
async def get_credits() -> dict[str, Any]:
    try:
        return _ok(await _client().credits())
    except Exception as exc:  # noqa: BLE001
        return _fail(exc)


@server.tool(description="Create a Stripe checkout for a credit pack (100 credits).")
async def top_up(pack: int = 1, idempotency_key: str | None = None) -> dict[str, Any]:
    try:
        return _ok(await _client().top_up(pack, idempotency_key))
    except Exception as exc:  # noqa: BLE001
        return _fail(exc)


@server.tool(description="Campaigns with counts.")
async def list_campaigns() -> dict[str, Any]:
    try:
        client = _client()
        campaigns = await client.campaigns()
        details = [await client.campaign(c["id"]) for c in campaigns]
        return _ok(details)
    except Exception as exc:  # noqa: BLE001
        return _fail(exc)


@server.tool(description="Render the next personalized message for one lead without sending.")
async def preview_message(campaign_id: str, lead_id: str) -> dict[str, Any]:
    try:
        return _ok(await _client().preview(campaign_id, lead_id))
    except Exception as exc:  # noqa: BLE001
        return _fail(exc)


async def _health(_: Request) -> JSONResponse:
    return JSONResponse({"status": "ok", "server": "letmelead-mcp", "version": "1.0.0"})


def build_app() -> Starlette:
    """Public ASGI app: Streamable HTTP MCP at /mcp plus an unauthenticated /health.

    The session manager needs its own lifespan to run, and a mounted sub-app does not
    receive one, so the inner app's lifespan is passed through explicitly.
    """
    transport = server.streamable_http_app(stateless_http=True, host="0.0.0.0")
    from starlette.routing import Mount

    return Starlette(
        routes=[Route("/health", _health), Mount("/", app=ApiKeyMiddleware(transport))],
        lifespan=transport.router.lifespan_context,
    )


def app():  # pragma: no cover - uvicorn factory
    return build_app()


def main() -> None:
    logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
    if os.getenv("MCP_TRANSPORT", "http") == "stdio":
        asyncio.run(server.run_stdio_async())
        return
    import uvicorn

    # build_app() adds the unauthenticated /health route used by the container healthcheck.
    uvicorn.run(
        build_app(),
        host="0.0.0.0",
        port=int(os.getenv("MCP_PORT", "8765")),
        log_level=os.getenv("LOG_LEVEL", "info").lower(),
    )


if __name__ == "__main__":  # pragma: no cover
    main()
