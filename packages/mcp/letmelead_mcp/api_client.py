"""Typed REST client used by every MCP tool.

Keeping the MCP layer thin guarantees it cannot drift from the REST surface: there is
exactly one implementation of each operation, and it lives in the API.
"""

from __future__ import annotations

import os
from typing import Any

import httpx


class ApiError(RuntimeError):
    def __init__(self, status_code: int, code: str, message: str, details: dict | None = None) -> None:
        super().__init__(f"{code}: {message}")
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details or {}

    def as_dict(self) -> dict[str, Any]:
        return {"ok": False, "error": {"code": self.code, "message": self.message, "details": self.details}}


class LetMeLeadClient:
    def __init__(self, base_url: str | None = None, api_key: str | None = None, timeout: float = 60.0) -> None:
        self.base_url = (base_url or os.getenv("LETMELEAD_API_URL", "http://api:8000")).rstrip("/")
        key = api_key or os.getenv("LETMELEAD_API_KEY", "")
        if not key:
            raise RuntimeError(
                "No API key. Set LETMELEAD_API_KEY (create one in Settings → API keys)."
            )
        self._headers = {"X-API-Key": key, "Content-Type": "application/json"}
        self._timeout = timeout

    async def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        async with httpx.AsyncClient(timeout=self._timeout, headers=self._headers) as client:
            res = await client.request(method, f"{self.base_url}/v1{path}", **kwargs)
        if res.status_code >= 400:
            try:
                body = res.json().get("error", {})
            except ValueError:
                body = {}
            raise ApiError(res.status_code, body.get("code", "http_error"), body.get("message", res.text[:300]),
                           body.get("details"))
        if res.status_code == 204:
            return None
        return res.json()

    # --- reads ---
    async def tenant(self) -> dict:
        return await self._request("GET", "/tenant")

    async def credits(self) -> dict:
        return await self._request("GET", "/credits")

    async def ledger(self, limit: int = 20) -> dict:
        return await self._request("GET", "/credits/ledger", params={"limit": limit})

    async def leads(self, **params: Any) -> dict:
        clean = {k: v for k, v in params.items() if v is not None}
        return await self._request("GET", "/leads", params=clean)

    async def lead(self, lead_id: str) -> dict:
        return await self._request("GET", f"/leads/{lead_id}")

    async def campaigns(self) -> list[dict]:
        return await self._request("GET", "/campaigns")

    async def campaign(self, campaign_id: str) -> dict:
        return await self._request("GET", f"/campaigns/{campaign_id}")

    async def replies(self, limit: int = 25, unread_only: bool = False) -> dict:
        return await self._request("GET", "/replies", params={"limit": limit, "unread_only": unread_only})

    async def sources(self) -> list[dict]:
        return await self._request("GET", "/sources")

    async def targets(self, limit: int = 50) -> dict:
        return await self._request("GET", "/targets", params={"limit": limit})

    # --- writes ---
    async def scan(self, sources: list[str] | None = None, wait: bool = True, limit_targets: int = 50) -> dict:
        return await self._request(
            "POST", "/sources/scan",
            json={"sources": sources, "wait": wait, "limit_targets": limit_targets},
            timeout=600 if wait else 60,
        )

    async def claim(self, lead_id: str, idempotency_key: str | None = None) -> dict:
        headers = {"Idempotency-Key": idempotency_key} if idempotency_key else None
        return await self._request("POST", f"/leads/{lead_id}/claim", headers=headers)

    async def not_fit(self, lead_id: str, reason: str) -> dict:
        return await self._request("POST", f"/leads/{lead_id}/not-fit", json={"reason": reason})

    async def create_campaign(self, name: str, lead_ids: list[str] | None = None) -> dict:
        return await self._request("POST", "/campaigns", json={"name": name, "lead_ids": lead_ids or []})

    async def queue(self, campaign_id: str, lead_ids: list[str] | None = None) -> dict:
        return await self._request("POST", f"/campaigns/{campaign_id}/queue", json={"lead_ids": lead_ids or []})

    async def send(self, campaign_id: str) -> dict:
        return await self._request("POST", f"/campaigns/{campaign_id}/send")

    async def pause(self, campaign_id: str, reason: str | None = None) -> dict:
        return await self._request("POST", f"/campaigns/{campaign_id}/pause", json={"reason": reason})

    async def top_up(self, pack: int = 1, idempotency_key: str | None = None) -> dict:
        headers = {"Idempotency-Key": idempotency_key} if idempotency_key else None
        return await self._request("POST", "/orders/top-up", json={"pack": pack}, headers=headers)

    async def preview(self, campaign_id: str, lead_id: str) -> dict:
        return await self._request("GET", f"/campaigns/{campaign_id}/preview/{lead_id}")
