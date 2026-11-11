"""Outbound webhooks with HMAC signatures and durable delivery records."""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
from datetime import UTC, datetime

import httpx
import sqlalchemy as sa
from sqlalchemy.orm import Session

from ..models import Webhook, WebhookDelivery

logger = logging.getLogger("letmelead.webhooks")

EVENTS = ("lead.created", "lead.claimed", "reply.received")


def sign(secret: str, body: bytes) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def enqueue(db: Session, tenant_id, event: str, payload: dict) -> list[WebhookDelivery]:
    hooks = db.scalars(
        sa.select(Webhook).where(Webhook.tenant_id == tenant_id, Webhook.active.is_(True))
    ).all()
    deliveries = []
    for hook in hooks:
        if hook.events and event not in hook.events:
            continue
        delivery = WebhookDelivery(webhook_id=hook.id, event=event, payload=payload, status="pending")
        db.add(delivery)
        deliveries.append(delivery)
    return deliveries


async def deliver(delivery: WebhookDelivery, hook: Webhook) -> bool:
    body = json.dumps({"event": delivery.event, "data": delivery.payload, "sent_at": datetime.now(UTC).isoformat()},
                      separators=(",", ":")).encode()
    headers = {
        "Content-Type": "application/json",
        "X-LetMeLead-Event": delivery.event,
        "X-LetMeLead-Signature": sign(hook.secret, body),
    }
    delivery.attempts += 1
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.post(hook.url, content=body, headers=headers)
        delivery.response_code = res.status_code
        if 200 <= res.status_code < 300:
            delivery.status = "delivered"
            delivery.delivered_at = datetime.now(UTC)
            return True
        delivery.status = "failed"
        delivery.error = f"HTTP {res.status_code}"
    except httpx.HTTPError as exc:
        delivery.status = "failed"
        delivery.error = str(exc)[:400]
    logger.warning("webhook_delivery_failed", extra={"event": delivery.event, "error": delivery.error})
    return False
