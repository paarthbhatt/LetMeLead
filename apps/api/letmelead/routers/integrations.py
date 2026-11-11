"""Outbound webhooks, audit log and health/providers endpoints."""

from __future__ import annotations

import secrets
import uuid
from datetime import timedelta

import sqlalchemy as sa
from fastapi import APIRouter, Query

from .. import audit
from ..config import settings
from ..deps import ActorDep, DbSession, OwnerDep, apply_cursor, page
from ..errors import ApiError
from ..models import AuditLog, Reply, Signal, Webhook
from ..schemas import AuditOut, HealthOut, Page, WebhookCreate, WebhookOut

router = APIRouter(tags=["integrations"])


@router.get("/webhooks", response_model=list[WebhookOut])
def list_webhooks(actor: ActorDep, db: DbSession):
    return db.scalars(sa.select(Webhook).where(Webhook.tenant_id == actor.tenant_id)).all()


@router.post("/webhooks", response_model=WebhookOut, status_code=201)
def create_webhook(payload: WebhookCreate, actor: OwnerDep, db: DbSession):
    hook = Webhook(
        tenant_id=actor.tenant_id,
        url=str(payload.url),
        secret=secrets.token_urlsafe(32),
        events=payload.events,
    )
    db.add(hook)
    audit.record(db, actor.tenant_id, "webhook.created", actor.actor_type, actor.actor_id, "webhook", hook.id,
                 meta={"url": str(payload.url), "events": payload.events})
    db.commit()
    return hook


@router.delete("/webhooks/{webhook_id}", status_code=204)
def delete_webhook(webhook_id: uuid.UUID, actor: OwnerDep, db: DbSession):
    hook = db.scalar(sa.select(Webhook).where(Webhook.id == webhook_id, Webhook.tenant_id == actor.tenant_id))
    if not hook:
        raise ApiError("not_found", "Webhook not found.", status_code=404)
    db.delete(hook)
    audit.record(db, actor.tenant_id, "webhook.deleted", actor.actor_type, actor.actor_id, "webhook", webhook_id)
    db.commit()


@router.get("/audit", response_model=Page[AuditOut])
def list_audit(
    actor: ActorDep,
    db: DbSession,
    limit: int = Query(default=50, ge=1, le=200),
    cursor: str | None = None,
    action: str | None = None,
):
    stmt = sa.select(AuditLog).where(AuditLog.tenant_id == actor.tenant_id)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    rows = list(db.scalars(apply_cursor(stmt, AuditLog, cursor, min(limit, 200))).all())
    items, next_cursor = page(rows, min(limit, 200), AuditLog)
    return Page(items=[AuditOut.model_validate(r) for r in items], next_cursor=next_cursor)


@router.get("/health", response_model=HealthOut)
def health(db: DbSession):
    db.execute(sa.text("SELECT 1"))
    return HealthOut(
        status="ok",
        version=__import__("letmelead").__version__,
        providers={
            "llm": settings.llm_provider,
            "enrichment": settings.enrichment_provider,
            "stripe": bool(settings.stripe_secret_key),
            "google_oauth": bool(settings.google_client_id),
            "outreach_enabled": settings.outreach_enabled,
            "outreach_dry_run": settings.outreach_dry_run,
        },
    )


@router.get("/stats")
def stats(actor: ActorDep, db: DbSession):
    """Small dashboard summary: counts and the last 7 days of activity."""
    since = sa.func.now() - timedelta(days=7)
    return {
        "signals_7d": int(
            db.scalar(
                sa.select(sa.func.count()).select_from(Signal).where(
                    Signal.tenant_id == actor.tenant_id, Signal.created_at >= since
                )
            )
            or 0
        ),
        "replies_unread": int(
            db.scalar(
                sa.select(sa.func.count()).select_from(Reply).where(
                    Reply.tenant_id == actor.tenant_id, Reply.read_at.is_(None)
                )
            )
            or 0
        ),
    }
