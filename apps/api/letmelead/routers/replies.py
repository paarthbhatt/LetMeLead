"""Reply inbox and reply ingestion (worker/agent webhook)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import sqlalchemy as sa
from fastapi import APIRouter
from pydantic import BaseModel, Field

from ..deps import ActorDep, DbSession, WriterDep, apply_cursor, page
from ..errors import ApiError
from ..models import Lead, Reply
from ..schemas import Page, ReplyOut
from ..services.outreach import record_reply

router = APIRouter(prefix="/replies", tags=["replies"])


class ReplyIngest(BaseModel):
    lead_id: uuid.UUID
    campaign_id: uuid.UUID | None = None
    body: str = Field(min_length=1, max_length=10_000)


@router.get("", response_model=Page[ReplyOut])
def list_replies(
    actor: ActorDep, db: DbSession, limit: int = 50, cursor: str | None = None, unread_only: bool = False
):
    stmt = sa.select(Reply).where(Reply.tenant_id == actor.tenant_id)
    if unread_only:
        stmt = stmt.where(Reply.read_at.is_(None))
    rows = list(db.scalars(apply_cursor(stmt, Reply, cursor, min(limit, 200))).all())
    items, next_cursor = page(rows, min(limit, 200), Reply)
    return Page(items=[ReplyOut.model_validate(r) for r in items], next_cursor=next_cursor)


@router.post("/ingest", response_model=ReplyOut, status_code=201)
def ingest(payload: ReplyIngest, actor: WriterDep, db: DbSession):
    """Record a reply. Stops the lead's sequence immediately (the documented behaviour)."""
    try:
        reply = record_reply(db, actor.tenant, payload.lead_id, payload.body, payload.campaign_id)
    except ValueError as exc:
        raise ApiError("not_found", str(exc), status_code=404) from exc
    return ReplyOut.model_validate(reply)


@router.post("/{reply_id}/read", response_model=ReplyOut)
def mark_read(reply_id: uuid.UUID, actor: ActorDep, db: DbSession):
    reply = db.scalar(sa.select(Reply).where(Reply.id == reply_id, Reply.tenant_id == actor.tenant_id))
    if not reply:
        raise ApiError("not_found", "Reply not found.", status_code=404)
    reply.read_at = datetime.now(UTC)
    db.commit()
    return ReplyOut.model_validate(reply)


@router.get("/threads")
def threads(actor: ActorDep, db: DbSession):
    """Group unread replies by lead so the inbox reads like a conversation list."""
    rows = db.execute(
        sa.select(Reply, Lead.company, Lead.domain)
        .join(Lead, Lead.id == Reply.lead_id)
        .where(Reply.tenant_id == actor.tenant_id)
        .order_by(Reply.received_at.desc())
    ).all()
    seen: dict[uuid.UUID, dict] = {}
    for reply, company, domain in rows:
        entry = seen.setdefault(
            reply.lead_id,
            {
                "lead_id": str(reply.lead_id),
                "company": company,
                "domain": domain,
                "last_reply_at": reply.received_at,
                "unread": 0,
                "preview": reply.body[:140],
            },
        )
        if reply.read_at is None:
            entry["unread"] += 1
    return {"threads": list(seen.values())}
