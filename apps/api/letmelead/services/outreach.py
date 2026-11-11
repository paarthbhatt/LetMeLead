"""Outreach orchestration: queue -> pace -> send -> stop on reply."""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import sqlalchemy as sa
from sqlalchemy.orm import Session

from .. import audit, security
from ..models import (
    Campaign,
    Contact,
    Lead,
    LinkedinAccount,
    Message,
    Reply,
    Sequence,
    Tenant,
)
from .linkedin_worker import LinkedinSessionError, LinkedinWorker
from .pacing import current_cap, schedule, withdraw_cutoff
from .personalization import personalize
from .webhooks_out import enqueue

logger = logging.getLogger("letmelead.outreach")


def _sequence(db: Session, campaign: Campaign) -> Sequence | None:
    return db.scalar(sa.select(Sequence).where(Sequence.campaign_id == campaign.id))


def _contact_for(db: Session, lead: Lead) -> Contact | None:
    return db.scalar(
        sa.select(Contact).where(Contact.lead_id == lead.id).order_by(Contact.confidence.desc()).limit(1)
    )


def next_step_for(db: Session, campaign: Campaign, lead_id: uuid.UUID) -> int:
    last = db.scalar(
        sa.select(sa.func.max(Message.step_no)).where(
            Message.campaign_id == campaign.id, Message.lead_id == lead_id
        )
    )
    return int(last or 0) + 1


def campaigns_leads(db: Session, campaign: Campaign) -> list[Lead]:
    """Leads in this campaign = claimed leads tagged through messages or explicit queue."""
    return list(
        db.scalars(
            sa.select(Lead)
            .join(Message, Message.lead_id == Lead.id)
            .where(Message.campaign_id == campaign.id)
            .distinct()
        ).all()
    )


async def queue_messages(
    db: Session, tenant: Tenant, campaign: Campaign, lead_ids: list[uuid.UUID]
) -> list[Message]:
    sequence = _sequence(db, campaign)
    if not sequence or not sequence.steps:
        raise ValueError("Campaign has no sequence yet.")
    created: list[Message] = []
    slots = schedule(len(lead_ids))

    for lead_id, slot in zip(lead_ids, slots, strict=False):
        lead = db.scalar(sa.select(Lead).where(Lead.id == lead_id, Lead.tenant_id == tenant.id))
        if not lead or lead.fit == "not_fit" or lead.status in {"replied", "meeting", "archived"}:
            continue
        step_no = next_step_for(db, campaign, lead_id)
        step = next((s for s in sequence.steps if s.step_no == step_no), None)
        if step is None:
            continue
        contact = _contact_for(db, lead)
        body = await personalize(tenant, lead, step, contact)
        message = Message(
            tenant_id=tenant.id,
            campaign_id=campaign.id,
            lead_id=lead.id,
            contact_id=contact.id if contact else None,
            step_no=step.step_no,
            body=body,
            status="queued",
            scheduled_at=slot,
            meta={"kind": step.kind, "personalized": True},
        )
        db.add(message)
        created.append(message)

    if campaign.status == "draft":
        campaign.status = "active"
        campaign.ramp_started_at = campaign.ramp_started_at or datetime.now(UTC)
    db.commit()
    return created


def _sent_today(db: Session, tenant_id: uuid.UUID, campaign_id: uuid.UUID | None = None) -> int:
    start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    stmt = sa.select(sa.func.count()).select_from(Message).where(
        Message.tenant_id == tenant_id, Message.status == "sent", Message.sent_at >= start
    )
    if campaign_id:
        stmt = stmt.where(Message.campaign_id == campaign_id)
    return int(db.scalar(stmt) or 0)


async def process_campaign(db: Session, tenant: Tenant, campaign: Campaign, limit: int = 25) -> dict[str, Any]:
    if campaign.status != "active":
        return {"sent": 0, "failed": 0, "skipped": 0, "note": f"campaign is {campaign.status}"}

    account = db.scalar(sa.select(LinkedinAccount).where(LinkedinAccount.tenant_id == tenant.id))
    if not account or account.status != "connected":
        return {"sent": 0, "failed": 0, "skipped": 0, "note": "connect a LinkedIn account first"}

    cap = current_cap(campaign.ramp_started_at or account.connected_at, campaign.daily_cap)
    remaining = max(cap - _sent_today(db, tenant.id, campaign.id), 0)
    if remaining == 0:
        return {"sent": 0, "failed": 0, "skipped": 0, "note": f"daily cap reached ({cap})"}

    now = datetime.now(UTC)
    due = db.scalars(
        sa.select(Message)
        .where(
            Message.campaign_id == campaign.id,
            Message.status == "queued",
            sa.or_(Message.scheduled_at.is_(None), Message.scheduled_at <= now),
        )
        .order_by(Message.scheduled_at.asc().nullsfirst())
        .limit(min(remaining, limit))
    ).all()
    if not due:
        return {"sent": 0, "failed": 0, "skipped": 0, "note": "nothing due"}

    storage_state = None
    if account.session_blob:
        storage_state = __import__("json").loads(security.decrypt_secret(account.session_blob))
    worker = LinkedinWorker(storage_state)
    sent = failed = skipped = 0

    for message in due:
        lead = db.get(Lead, message.lead_id)
        if not lead or lead.status in {"replied", "meeting", "archived"}:
            message.status = "skipped"
            message.error = "lead replied or was archived"
            skipped += 1
            continue
        profile = lead.linkedin_url
        if not profile:
            message.status = "skipped"
            message.error = "no LinkedIn profile URL on the lead"
            skipped += 1
            continue
        try:
            result = await worker.send(profile_url=profile, kind=message.meta.get("kind", "message"), message=message.body)
        except LinkedinSessionError as exc:
            account.status = "error"
            account.paused_reason = str(exc)[:400]
            db.commit()
            return {"sent": sent, "failed": failed, "skipped": skipped, "note": str(exc)}
        except Exception as exc:  # noqa: BLE001 - record, never crash the batch
            result = type("R", (), {"ok": False, "detail": str(exc)[:300], "simulated": False})()

        if result.ok:
            message.status = "sent"
            message.sent_at = datetime.now(UTC)
            message.error = None
            message.meta = {**message.meta, "simulated": result.simulated, "detail": result.detail}
            sent += 1
            lead.status = "contacted" if lead.status == "new" else lead.status
            audit.record(
                db, tenant.id, "outreach.sent", actor_type="system", target_type="message", target_id=message.id,
                meta={"campaign_id": str(campaign.id), "lead_id": str(lead.id), "step": message.step_no,
                      "simulated": result.simulated},
            )
        else:
            message.status = "failed"
            message.error = result.detail[:500]
            failed += 1
            audit.record(
                db, tenant.id, "outreach.failed", actor_type="system", target_type="message", target_id=message.id,
                meta={"error": message.error},
            )

    db.commit()
    return {"sent": sent, "failed": failed, "skipped": skipped, "daily_cap": cap, "remaining": remaining - sent}


async def queue_next_steps(db: Session, tenant: Tenant, campaign: Campaign) -> int:
    """After a step is delivered, schedule the next one with its configured delay."""
    sequence = _sequence(db, campaign)
    if not sequence:
        return 0
    created = 0
    leads = campaigns_leads(db, campaign)
    for lead in leads:
        if lead.status in {"replied", "meeting", "archived"}:
            continue
        step_no = next_step_for(db, campaign, lead.id)
        step = next((s for s in sequence.steps if s.step_no == step_no), None)
        if step is None:
            continue
        previous = db.scalar(
            sa.select(Message)
            .where(Message.campaign_id == campaign.id, Message.lead_id == lead.id)
            .order_by(Message.step_no.desc())
            .limit(1)
        )
        if not previous or previous.status != "sent":
            continue
        if previous.sent_at and datetime.now(UTC) < previous.sent_at + timedelta(days=step.delay_days):
            continue
        contact = _contact_for(db, lead)
        body = await personalize(tenant, lead, step, contact)
        db.add(
            Message(
                tenant_id=tenant.id,
                campaign_id=campaign.id,
                lead_id=lead.id,
                contact_id=contact.id if contact else None,
                step_no=step.step_no,
                body=body,
                status="queued",
                scheduled_at=datetime.now(UTC),
                meta={"kind": step.kind, "personalized": True},
            )
        )
        created += 1
    db.commit()
    return created


def record_reply(
    db: Session,
    tenant: Tenant,
    lead_id: uuid.UUID,
    body: str,
    campaign_id: uuid.UUID | None = None,
    account_id: uuid.UUID | None = None,
) -> Reply:
    lead = db.scalar(sa.select(Lead).where(Lead.id == lead_id, Lead.tenant_id == tenant.id))
    if not lead:
        raise ValueError("lead not found")
    reply = Reply(
        tenant_id=tenant.id,
        campaign_id=campaign_id,
        lead_id=lead.id,
        linkedin_account_id=account_id,
        body=body[:10_000],
        received_at=datetime.now(UTC),
        stop_sequence=True,
    )
    db.add(reply)
    lead.status = "replied"
    if lead.fit == "unknown":
        lead.fit = "fit"
    db.execute(sa.update(Message).where(Message.lead_id == lead.id, Message.status == "queued").values(status="skipped"))
    db.execute(sa.update(Message).where(Message.lead_id == lead.id, Message.status == "failed").values(status="failed"))
    audit.record(
        db, tenant.id, "reply.received", actor_type="system", target_type="lead", target_id=lead.id,
        meta={"campaign_id": str(campaign_id) if campaign_id else None},
    )
    enqueue(db, tenant.id, "reply.received", {"lead_id": str(lead.id), "company": lead.company, "body": body[:500]})
    db.commit()
    return reply


async def withdraw_stale(db: Session, tenant: Tenant, limit: int = 20) -> dict[str, Any]:
    account = db.scalar(sa.select(LinkedinAccount).where(LinkedinAccount.tenant_id == tenant.id))
    if not account or account.status != "connected":
        return {"withdrawn": 0, "note": "no connected account"}
    storage_state = None
    if account.session_blob:
        storage_state = __import__("json").loads(security.decrypt_secret(account.session_blob))
    worker = LinkedinWorker(storage_state)
    cutoff = withdraw_cutoff()
    candidates = db.scalars(
        sa.select(Message)
        .where(
            Message.tenant_id == tenant.id,
            Message.status == "sent",
            Message.sent_at < cutoff,
        )
        .order_by(Message.sent_at.asc())
        .limit(limit * 4)
    ).all()
    # JSON path filters differ between SQLite and PostgreSQL; filter the small page in Python.
    stale = [m for m in candidates if (m.meta or {}).get("kind") == "connect"][:limit]
    withdrawn = 0
    for message in stale:
        lead = db.get(Lead, message.lead_id)
        if not lead:
            continue
        replied = db.scalar(sa.select(Reply.id).where(Reply.lead_id == lead.id).limit(1))
        if replied:
            continue
        result = await worker.withdraw(profile_url=lead.linkedin_url or "")
        if result.ok:
            message.status = "withdrawn"
            message.meta = {**message.meta, "withdrawn_at": datetime.now(UTC).isoformat()}
            withdrawn += 1
            audit.record(
                db, tenant.id, "outreach.withdrawn", actor_type="system", target_type="message", target_id=message.id,
                meta={"lead_id": str(lead.id), "simulated": result.simulated},
            )
    db.commit()
    return {"withdrawn": withdrawn, "checked": len(stale)}
