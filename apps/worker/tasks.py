"""Celery tasks. Each task owns its database session and never raises for per-tenant errors."""

from __future__ import annotations

import asyncio
import logging
import uuid

from celery import shared_task
from letmelead import audit
from letmelead.db import SessionLocal
from letmelead.models import Campaign, Source, Tenant, Webhook, WebhookDelivery
from letmelead.services.engine import run_scan
from letmelead.services.outreach import process_campaign, queue_next_steps, withdraw_stale
from letmelead.services.webhooks_out import deliver
from sqlalchemy import select

logger = logging.getLogger("letmelead.tasks")

QUEUES = ["default", "scans", "outreach"]


def _tenants(db):
    return db.scalars(select(Tenant)).all()


@shared_task(name="letmelead.scan_tenant", bind=True, max_retries=2, default_retry_delay=120)
def scan_tenant(self, tenant_id: str, sources: list[str] | None = None, limit: int = 50):
    db = SessionLocal()
    try:
        tenant = db.get(Tenant, uuid.UUID(tenant_id))
        if not tenant:
            return {"skipped": "tenant not found"}
        report = asyncio.run(run_scan(db, tenant, sources, limit))
        logger.info("scan_completed", extra={"tenant": tenant_id, "leads": report.leads_created})
        return report.as_dict()
    except Exception as exc:  # noqa: BLE001
        logger.exception("scan_failed", extra={"tenant": tenant_id})
        db.rollback()
        raise self.retry(exc=exc) from exc
    finally:
        db.close()


@shared_task(name="letmelead.schedule_scans")
def schedule_scans():
    """Fan out one scan per tenant that has enabled sources."""
    db = SessionLocal()
    queued = 0
    try:
        for tenant in _tenants(db):
            enabled = db.scalar(select(Source.id).where(Source.tenant_id == tenant.id, Source.enabled.is_(True)))
            if enabled:
                scan_tenant.delay(str(tenant.id))
                queued += 1
        return {"queued": queued}
    finally:
        db.close()


@shared_task(name="letmelead.process_campaign", bind=True, max_retries=3, default_retry_delay=60)
def process_campaign_task(self, campaign_id: str):
    db = SessionLocal()
    try:
        campaign = db.get(Campaign, uuid.UUID(campaign_id))
        if not campaign or campaign.status != "active":
            return {"skipped": "inactive"}
        tenant = db.get(Tenant, campaign.tenant_id)
        result = asyncio.run(process_campaign(db, tenant, campaign))
        scheduled = asyncio.run(queue_next_steps(db, tenant, campaign))
        logger.info("campaign_processed", extra={"tenant": str(tenant.id), "campaign": campaign_id})
        return {**result, "next_steps_queued": scheduled}
    except Exception as exc:  # noqa: BLE001
        logger.exception("campaign_failed", extra={"campaign": campaign_id})
        db.rollback()
        raise self.retry(exc=exc) from exc
    finally:
        db.close()


@shared_task(name="letmelead.schedule_outreach")
def schedule_outreach():
    db = SessionLocal()
    queued = 0
    try:
        for campaign in db.scalars(select(Campaign).where(Campaign.status == "active")).all():
            process_campaign_task.delay(str(campaign.id))
            queued += 1
        return {"queued": queued}
    finally:
        db.close()


@shared_task(name="letmelead.withdraw_stale")
def withdraw_task(tenant_id: str):
    db = SessionLocal()
    try:
        tenant = db.get(Tenant, uuid.UUID(tenant_id))
        if not tenant:
            return {"skipped": "tenant not found"}
        result = asyncio.run(withdraw_stale(db, tenant))
        if result.get("withdrawn"):
            audit.record(db, tenant.id, "outreach.withdraw_run", actor_type="system", meta=result)
            db.commit()
        return result
    finally:
        db.close()


@shared_task(name="letmelead.withdraw_all")
def withdraw_all():
    db = SessionLocal()
    count = 0
    try:
        for tenant in _tenants(db):
            withdraw_task.delay(str(tenant.id))
            count += 1
        return {"queued": count}
    finally:
        db.close()


@shared_task(name="letmelead.deliver_webhooks")
def deliver_webhooks():
    db = SessionLocal()
    delivered = failed = 0
    try:
        pending = db.scalars(
            select(WebhookDelivery)
            .where(WebhookDelivery.status == "pending", WebhookDelivery.attempts < 5)
            .order_by(WebhookDelivery.created_at.asc())
            .limit(50)
        ).all()
        for delivery in pending:
            hook = db.get(Webhook, delivery.webhook_id)
            if not hook or not hook.active:
                delivery.status = "cancelled"
                continue
            if asyncio.run(deliver(delivery, hook)):
                delivered += 1
            else:
                failed += 1
        db.commit()
        return {"delivered": delivered, "failed": failed}
    finally:
        db.close()
