"""Leads: browse evidence, claim with credits, mark not a fit."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Literal

import sqlalchemy as sa
from fastapi import APIRouter, Query
from sqlalchemy.orm import Session

from .. import audit, credits
from ..deps import ActorDep, DbSession, IdempotencyDep, WriterDep, apply_cursor, page
from ..errors import ApiError
from ..models import Contact, Lead, LeadSignal, Reply, Signal
from ..schemas import (
    ClaimResponse,
    ContactOut,
    LeadDetail,
    LeadOut,
    LeadUpdate,
    NotFitRequest,
    Page,
    SignalOut,
)
from ..services.webhooks_out import enqueue

router = APIRouter(prefix="/leads", tags=["leads"])


def _detail(db: Session, lead: Lead) -> LeadDetail:
    rows = db.execute(
        sa.select(Signal, LeadSignal.points)
        .join(LeadSignal, LeadSignal.signal_id == Signal.id)
        .where(LeadSignal.lead_id == lead.id)
        .order_by(Signal.published_at.desc().nullslast())
    ).all()
    evidence = [
        SignalOut(
            id=s.id, source=s.source, type=s.type, strength=s.strength, title=s.title, url=s.url,
            published_at=s.published_at, points=points,
        )
        for s, points in rows
    ]
    contacts = db.scalars(sa.select(Contact).where(Contact.lead_id == lead.id)).all()
    return LeadDetail(
        **LeadOut.model_validate(lead).model_dump(),
        evidence=evidence,
        contacts=[ContactOut.model_validate(c) for c in contacts],
        fit_evidence=lead.fit_evidence or {},
    )


@router.get("", response_model=Page[LeadOut])
def list_leads(
    actor: ActorDep,
    db: DbSession,
    limit: int = Query(default=50, ge=1, le=200),
    cursor: str | None = None,
    status: Literal["new", "claimed", "contacted", "replied", "meeting", "archived"] | None = None,
    fit: Literal["fit", "not_fit", "unknown"] | None = None,
    min_score: float | None = None,
    q: str | None = None,
):
    stmt = (
        sa.select(Lead)
        .where(Lead.tenant_id == actor.tenant_id)
        .options(sa.orm.selectinload(Lead.contacts))
    )
    if status:
        stmt = stmt.where(Lead.status == status)
    if fit:
        stmt = stmt.where(Lead.fit == fit)
    if min_score is not None:
        stmt = stmt.where(Lead.score >= min_score)
    if q:
        needle = f"%{q.lower()}%"
        stmt = stmt.where(sa.or_(sa.func.lower(Lead.company).like(needle), Lead.domain.like(needle)))
    rows = list(db.scalars(apply_cursor(stmt, Lead, cursor, limit)).all())
    items, next_cursor = page(rows, limit, Lead)
    leads = [LeadOut.model_validate(row) for row in items]
    for lead_out, row in zip(leads, items, strict=True):
        if row.contacts:
            lead_out.contact = ContactOut.model_validate(row.contacts[0])
    return Page(items=leads, next_cursor=next_cursor)


@router.get("/{lead_id}", response_model=LeadDetail)
def get_lead(lead_id: uuid.UUID, actor: ActorDep, db: DbSession):
    lead = db.scalar(sa.select(Lead).where(Lead.id == lead_id, Lead.tenant_id == actor.tenant_id))
    if not lead:
        raise ApiError("not_found", "Lead not found.", status_code=404)
    return _detail(db, lead)


@router.post("/{lead_id}/claim", response_model=ClaimResponse)
def claim_lead(
    lead_id: uuid.UUID,
    actor: WriterDep,
    db: DbSession,
    idem: IdempotencyDep,
):
    if idem.replay is not None:
        return idem.replay
    lead = db.scalar(sa.select(Lead).where(Lead.id == lead_id, Lead.tenant_id == actor.tenant_id))
    if not lead:
        raise ApiError("not_found", "Lead not found.", status_code=404)
    if lead.fit == "not_fit":
        raise ApiError("not_a_fit", "This lead was marked as not a fit.", status_code=409)
    if lead.claimed_at:
        raise ApiError("already_claimed", "This lead is already claimed.", status_code=409)

    charged, was_free = credits.claim_charge(db, actor.tenant_id, lead.id, lead.company)
    lead.status = "claimed"
    lead.claimed_at = datetime.now(UTC)
    lead.claimed_by = actor.user.id if actor.user else None
    audit.record(db, actor.tenant_id, "lead.claimed", actor.actor_type, actor.actor_id, "lead", lead.id,
                 meta={"credits": charged, "free": was_free})
    enqueue(db, actor.tenant_id, "lead.claimed",
            {"lead_id": str(lead.id), "company": lead.company, "credits": charged, "free": was_free})
    db.commit()

    body = ClaimResponse(
        lead=LeadOut.model_validate(lead),
        credits_charged=charged,
        was_free=was_free,
        credits_remaining=credits.balance(db, actor.tenant_id),
    )
    idem.store(body.model_dump(mode="json"), 200)
    return body


@router.post("/{lead_id}/not-fit", response_model=LeadOut)
def mark_not_fit(lead_id: uuid.UUID, payload: NotFitRequest, actor: WriterDep, db: DbSession):
    lead = db.scalar(sa.select(Lead).where(Lead.id == lead_id, Lead.tenant_id == actor.tenant_id))
    if not lead:
        raise ApiError("not_found", "Lead not found.", status_code=404)
    lead.fit = "not_fit"
    lead.fit_confidence = 1.0
    lead.fit_reason = payload.reason[:500]
    lead.fit_evidence = {**(lead.fit_evidence or {}), "human_rejected": True}
    lead.verification_status = "rejected"
    lead.status = "archived"
    audit.record(db, actor.tenant_id, "lead.not_fit", actor.actor_type, actor.actor_id, "lead", lead.id,
                 meta={"reason": payload.reason[:300]})
    db.commit()
    return LeadOut.model_validate(lead)


@router.patch("/{lead_id}", response_model=LeadOut)
def update_lead(lead_id: uuid.UUID, payload: LeadUpdate, actor: WriterDep, db: DbSession):
    lead = db.scalar(sa.select(Lead).where(Lead.id == lead_id, Lead.tenant_id == actor.tenant_id))
    if not lead:
        raise ApiError("not_found", "Lead not found.", status_code=404)
    if payload.status:
        lead.status = payload.status
    audit.record(db, actor.tenant_id, "lead.updated", actor.actor_type, actor.actor_id, "lead", lead.id,
                 meta=payload.model_dump(exclude_none=True))
    db.commit()
    return LeadOut.model_validate(lead)


@router.get("/{lead_id}/replies")
def lead_replies(lead_id: uuid.UUID, actor: ActorDep, db: DbSession):
    rows = db.scalars(
        sa.select(Reply).where(Reply.lead_id == lead_id, Reply.tenant_id == actor.tenant_id)
        .order_by(Reply.received_at.desc())
    ).all()
    return {"items": [{"id": r.id, "body": r.body, "received_at": r.received_at} for r in rows]}
