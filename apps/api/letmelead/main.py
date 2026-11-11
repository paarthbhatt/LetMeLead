"""FastAPI application entrypoint."""

from __future__ import annotations

import json
import logging
import sys
import time
import uuid
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import __version__, ratelimit
from .config import settings
from .db import get_db
from .errors import envelope, install_error_handlers
from .routers import auth, billing, campaigns, integrations, leads, linkedin, replies, sources, tenants


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "time": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
        }
        for key in ("request_id", "tenant", "source", "event", "error", "status"):
            value = getattr(record, key, None)
            if value is not None:
                payload[key] = value
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


def configure_logging() -> None:
    handler = logging.StreamHandler(sys.stdout)
    if settings.is_production:
        handler.setFormatter(JsonFormatter())
    else:
        handler.setFormatter(logging.Formatter("%(levelname)s %(name)s: %(message)s"))
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(settings.log_level)


def configure_sentry() -> None:
    if not settings.sentry_dsn:
        return
    try:  # optional dependency; the hook is env-driven, never hardcoded
        import sentry_sdk

        sentry_sdk.init(dsn=settings.sentry_dsn, environment=settings.env, traces_sample_rate=0.1)
    except ImportError:
        logging.getLogger("letmelead").warning("sentry_dsn_set_but_sdk_missing")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    configure_logging()
    configure_sentry()
    # Fail fast on a broken database rather than on the first request.
    db = next(get_db())
    try:
        db.execute(__import__("sqlalchemy").text("SELECT 1"))
    finally:
        db.close()
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title="LetMeLead API",
        version=__version__,
        openapi_url="/v1/openapi.json",
        docs_url="/v1/docs",
        lifespan=lifespan,
        description=(
            "Multi-tenant buying-signal lead engine: signals with evidence, qualified leads, "
            "credits, paced LinkedIn outreach and an MCP surface that mirrors this API."
        ),
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    install_error_handlers(app)

    @app.middleware("http")
    async def context_and_limits(request: Request, call_next):
        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:16]
        request.state.request_id = request_id
        started = time.perf_counter()

        if request.url.path.startswith("/v1/") and request.method != "OPTIONS":
            tenant_hint = request.headers.get("x-tenant-id") or request.headers.get("x-api-key", "")[:12]
            identity = tenant_hint or (request.client.host if request.client else "anonymous")
            group = request.url.path.split("/")[2] if len(request.url.path.split("/")) > 2 else "root"
            limit = 20 if group == "auth" else 600
            allowed, retry_after = ratelimit.check(f"{identity}:{group}", limit, 60)
            if not allowed:
                return JSONResponse(
                    status_code=429,
                    content=envelope("rate_limited", "Too many requests; slow down.", {"retry_after": retry_after},
                                     request_id),
                    headers={"Retry-After": str(retry_after)},
                )

        response = await call_next(request)
        duration_ms = round((time.perf_counter() - started) * 1000, 1)
        response.headers["X-Request-ID"] = request_id
        logging.getLogger("letmelead.access").info(
            "request",
            extra={"request_id": request_id, "status": response.status_code,
                   "event": f"{request.method} {request.url.path}", "duration_ms": duration_ms},
        )
        return response

    app.include_router(auth.router, prefix="/v1")
    app.include_router(tenants.router, prefix="/v1")
    app.include_router(sources.router, prefix="/v1")
    app.include_router(sources.targets_router, prefix="/v1")
    app.include_router(leads.router, prefix="/v1")
    app.include_router(campaigns.router, prefix="/v1")
    app.include_router(replies.router, prefix="/v1")
    app.include_router(linkedin.router, prefix="/v1")
    app.include_router(billing.router, prefix="/v1")
    app.include_router(integrations.router, prefix="/v1")

    @app.get("/", include_in_schema=False)
    def root():
        return {"name": "LetMeLead", "version": __version__, "docs": "/v1/docs"}

    return app


app = create_app()
