"""Campaigns, sequences, previews and sending."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import sqlalchemy as sa
from fastapi import APIRouter
from pydantic import BaseModel

from .. import audit
from ..deps import ActorDep, DbSession, WriterDep
from ..errors import ApiError
from ..models import (
    Campaign,
    Contact,
    Lead,
    Message,
    Reply,
    Sequence,
    SequenceStep,
    Tenant,
)
from ..schemas import (
    CampaignCreate,
    CampaignDetail,
    CampaignOut,
    CampaignPause,
    MessageOut,
    SequenceIn,
    SequenceOut,
    SequenceStepOut,
)
from ..services.outreach import (
    next_step_for,
    process_campaign,
    queue_messages,
    queue_next_steps,
)
from ..services.personalization import personalize

router = APIRouter(prefix="/campaigns", tags=["campaigns"])

DEFAULT_SEQUENCE = SequenceIn(
    name="Signal-led sequence",
    steps=[
        {
            "step_no": 1,
            "kind": "connect",
            "body_template": "Hi — I saw {signal}. I work with teams in that exact spot on {offer}. Worth connecting?",
            "delay_days": 0,
        },
        {
            "step_no": 2,
            "kind": "message",
            "body_template": "Thanks for connecting. {signal}. Happy to share how a similar team handled it — no pitch, just the playbook.",
            "delay_days": 3,
        },
    ],
)


class CampaignPatch(BaseModel):
    name: str | None = None
    daily_cap: int | None = None


class QueueRequest(BaseModel):
    lead_ids: list[uuid.UUID] = []


@router.get("", response_model=list[CampaignOut])
def list_campaigns(actor: ActorDep, db: DbSession):
    return db.scalars(
        sa.select(Campaign).where(Campaign.tenant_id == actor.tenant_id).order_by(Campaign.created_at.desc())
    ).all()


def _get(db: DbSession, actor, campaign_id: uuid.UUID) -> Campaign:
    campaign = db.scalar(
        sa.select(Campaign).where(Campaign.id == campaign_id, Campaign.tenant_id == actor.tenant_id)
    )
    if not campaign:
        raise ApiError("not_found", "Campaign not found.", status_code=404)
    return campaign


def _sequence_out(db: DbSession, campaign: Campaign) -> SequenceOut | None:
    sequence = db.scalar(sa.select(Sequence).where(Sequence.campaign_id == campaign.id))
    if not sequence:
        return None
    return SequenceOut(
        id=sequence.id,
        name=sequence.name,
        steps=[SequenceStepOut.model_validate(step) for step in sorted(sequence.steps, key=lambda s: s.step_no)],
    )


def _detail(db: DbSession, campaign: Campaign) -> CampaignDetail:
    lead_count = db.scalar(
        sa.select(sa.func.count(sa.distinct(Message.lead_id))).where(Message.campaign_id == campaign.id)
    )
    sent = db.scalar(
        sa.select(sa.func.count()).select_from(Message).where(
            Message.campaign_id == campaign.id, Message.status == "sent"
        )
    )
    pending = db.scalar(
        sa.select(sa.func.count()).select_from(Message).where(
            Message.campaign_id == campaign.id, Message.status == "queued"
        )
    )
    replies = db.scalar(sa.select(sa.func.count()).select_from(Reply).where(Reply.campaign_id == campaign.id))
    return CampaignDetail(
        **CampaignOut.model_validate(campaign).model_dump(),
        sequence=_sequence_out(db, campaign),
        lead_count=int(lead_count or 0),
        messages_sent=int(sent or 0),
        pending=int(pending or 0),
        replies=int(replies or 0),
    )


def _write_sequence(db, campaign: Campaign, payload: SequenceIn) -> Sequence:
    sequence = db.scalar(sa.select(Sequence).where(Sequence.campaign_id == campaign.id))
    if sequence:
        db.delete(sequence)
        db.flush()
    sequence = Sequence(campaign_id=campaign.id, name=payload.name)
    db.add(sequence)
    db.flush()
    for step in payload.steps:
        db.add(
            SequenceStep(
                sequence_id=sequence.id,
                step_no=step.step_no,
                kind=step.kind,
                body_template=step.body_template,
                delay_days=step.delay_days,
            )
        )
    db.flush()
    db.refresh(sequence)
    return sequence


@router.post("", response_model=CampaignDetail, status_code=201)
def create_campaign(payload: CampaignCreate, actor: WriterDep, db: DbSession):
    campaign = Campaign(
        tenant_id=actor.tenant_id,
        name=payload.name,
        status="draft",
        created_by=actor.user.id if actor.user else None,
    )
    db.add(campaign)
    db.flush()
    _write_sequence(db, campaign, payload.sequence or DEFAULT_SEQUENCE)
    audit.record(db, actor.tenant_id, "campaign.created", actor.actor_type, actor.actor_id, "campaign", campaign.id,
                 meta={"name": payload.name, "leads": len(payload.lead_ids)})
    db.commit()
    db.refresh(campaign)
    return _detail(db, campaign)


@router.get("/{campaign_id}", response_model=CampaignDetail)
def get_campaign(campaign_id: uuid.UUID, actor: ActorDep, db: DbSession):
    return _detail(db, _get(db, actor, campaign_id))


@router.patch("/{campaign_id}", response_model=CampaignDetail)
def patch_campaign(campaign_id: uuid.UUID, payload: CampaignPatch, actor: WriterDep, db: DbSession):
    campaign = _get(db, actor, campaign_id)
    if payload.name:
        campaign.name = payload.name
    if payload.daily_cap is not None:
        campaign.daily_cap = max(1, min(payload.daily_cap, 50))
    db.commit()
    return _detail(db, campaign)


@router.post("/{campaign_id}/pause", response_model=CampaignDetail)
def pause_campaign(campaign_id: uuid.UUID, payload: CampaignPause, actor: WriterDep, db: DbSession):
    campaign = _get(db, actor, campaign_id)
    campaign.status = "paused"
    campaign.pause_reason = payload.reason or "paused by user"
    audit.record(db, actor.tenant_id, "campaign.paused", actor.actor_type, actor.actor_id, "campaign", campaign.id,
                 meta={"reason": campaign.pause_reason})
    db.commit()
    return _detail(db, campaign)


@router.post("/{campaign_id}/resume", response_model=CampaignDetail)
def resume_campaign(campaign_id: uuid.UUID, actor: WriterDep, db: DbSession):
    campaign = _get(db, actor, campaign_id)
    if campaign.status == "completed":
        raise ApiError("completed", "This campaign is finished.", status_code=409)
    campaign.status = "active"
    campaign.pause_reason = None
    campaign.ramp_started_at = campaign.ramp_started_at or datetime.now(UTC)
    audit.record(db, actor.tenant_id, "campaign.resumed", actor.actor_type, actor.actor_id, "campaign", campaign.id)
    db.commit()
    return _detail(db, campaign)


@router.put("/{campaign_id}/sequence", response_model=SequenceOut)
def put_sequence(campaign_id: uuid.UUID, payload: SequenceIn, actor: WriterDep, db: DbSession):
    campaign = _get(db, actor, campaign_id)
    seq = _write_sequence(db, campaign, payload)
    audit.record(db, actor.tenant_id, "sequence.updated", actor.actor_type, actor.actor_id, "campaign", campaign.id,
                 meta={"steps": len(payload.steps)})
    db.commit()
    return _sequence_out(db, campaign) or SequenceOut(id=seq.id, name=seq.name, steps=[])


@router.post("/{campaign_id}/queue", response_model=dict)
async def queue(campaign_id: uuid.UUID, payload: QueueRequest, actor: WriterDep, db: DbSession):
    campaign = _get(db, actor, campaign_id)
    if payload.lead_ids:
        lead_ids = payload.lead_ids
    else:
        lead_ids = [
            lead.id
            for lead in db.scalars(
                sa.select(Lead).where(
                    Lead.tenant_id == actor.tenant_id,
                    Lead.status.in_(["claimed", "new"]),
                    Lead.fit != "not_fit",
                ).limit(50)
            ).all()
        ]
    tenant = db.get(Tenant, actor.tenant_id)
    messages = await queue_messages(db, tenant, campaign, lead_ids)
    audit.record(db, actor.tenant_id, "campaign.queued", actor.actor_type, actor.actor_id, "campaign", campaign.id,
                 meta={"messages": len(messages), "leads": len(lead_ids)})
    return {"queued": len(messages), "campaign_id": str(campaign.id)}


@router.post("/{campaign_id}/send", response_model=dict)
async def send(campaign_id: uuid.UUID, actor: WriterDep, db: DbSession):
    campaign = _get(db, actor, campaign_id)
    tenant = db.get(Tenant, actor.tenant_id)
    result = await process_campaign(db, tenant, campaign)
    scheduled = await queue_next_steps(db, tenant, campaign)
    audit.record(db, actor.tenant_id, "campaign.send_run", actor.actor_type, actor.actor_id, "campaign", campaign.id,
                 meta={**result, "next_steps_queued": scheduled})
    return {**result, "next_steps_queued": scheduled}


@router.get("/{campaign_id}/messages", response_model=list[MessageOut])
def messages(campaign_id: uuid.UUID, actor: ActorDep, db: DbSession, limit: int = 100):
    campaign = _get(db, actor, campaign_id)
    rows = db.scalars(
        sa.select(Message).where(Message.campaign_id == campaign.id).order_by(Message.created_at.desc()).limit(
            min(limit, 500)
        )
    ).all()
    return rows


@router.get("/{campaign_id}/preview/{lead_id}", response_model=dict)
async def preview(campaign_id: uuid.UUID, lead_id: uuid.UUID, actor: ActorDep, db: DbSession):
    """Render the next message for one lead without queueing anything."""
    campaign = _get(db, actor, campaign_id)
    lead = db.scalar(sa.select(Lead).where(Lead.id == lead_id, Lead.tenant_id == actor.tenant_id))
    if not lead:
        raise ApiError("not_found", "Lead not found.", status_code=404)
    sequence = db.scalar(sa.select(Sequence).where(Sequence.campaign_id == campaign.id))
    if not sequence or not sequence.steps:
        raise ApiError("no_sequence", "This campaign has no sequence.", status_code=409)
    step_no = next_step_for(db, campaign, lead.id)
    step = next((s for s in sequence.steps if s.step_no == step_no), None)
    if not step:
        return {"done": True, "step_no": step_no}
    contact = db.scalar(
        sa.select(Contact).where(Contact.lead_id == lead.id).order_by(Contact.confidence.desc()).limit(1)
    )
    tenant = db.get(Tenant, actor.tenant_id)
    body = await personalize(tenant, lead, step, contact)
    return {"step_no": step.step_no, "kind": step.kind, "body": body, "lead": lead.company}
