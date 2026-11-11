"""Outbound webhook signing, fan-out and delivery status handling."""

from __future__ import annotations

import hashlib
import hmac
import json

import httpx
import pytest
import respx
from letmelead import db as db_module
from letmelead.models import Tenant, Webhook, WebhookDelivery
from letmelead.services import webhooks_out


@pytest.fixture()
def tenant(session):
    import uuid

    t = Tenant(name="Hook Co", slug=f"hook-{uuid.uuid4().hex[:10]}", icp={})
    session.add(t)
    session.commit()
    return t


def _hook(session, tenant, url, secret="shhh", events=()):
    hook = Webhook(tenant_id=tenant.id, url=url, secret=secret, events=list(events), active=True)
    session.add(hook)
    session.commit()
    return hook


def test_sign_is_hmac_sha256():
    body = b'{"event":"lead.created"}'
    assert webhooks_out.sign("shhh", body) == hmac.new(b"shhh", body, hashlib.sha256).hexdigest()


def test_enqueue_fans_out_to_active_hooks_matching_events(session, tenant):
    matched = _hook(session, tenant, "https://a.example/hook", events=["lead.created"])
    _hook(session, tenant, "https://b.example/hook", events=["reply.received"])

    deliveries = webhooks_out.enqueue(session, tenant.id, "lead.created", {"lead": "l1"})

    assert len(deliveries) == 1
    assert deliveries[0].webhook_id == matched.id
    assert deliveries[0].event == "lead.created"
    assert deliveries[0].status == "pending"


def test_enqueue_skips_inactive_hooks(session, tenant):
    _hook(session, tenant, "https://a.example/hook", events=[])
    session.query(Webhook).update({"active": False})
    session.commit()
    assert webhooks_out.enqueue(session, tenant.id, "lead.created", {}) == []


def test_enqueue_with_empty_event_list_receives_everything(session, tenant):
    _hook(session, tenant, "https://catch-all.example/hook", events=[])
    deliveries = webhooks_out.enqueue(session, tenant.id, "reply.received", {})
    assert len(deliveries) == 1


@respx.mock
async def test_deliver_success_records_delivery(session, tenant):
    hook = _hook(session, tenant, "https://ok.example/hook", secret="topsecret")
    delivery = WebhookDelivery(webhook_id=hook.id, event="lead.claimed", payload={"id": "42"}, status="pending")
    session.add(delivery)
    session.commit()

    route = respx.post("https://ok.example/hook").mock(return_value=httpx.Response(200))

    assert await webhooks_out.deliver(delivery, hook) is True
    assert delivery.status == "delivered"
    assert delivery.attempts == 1
    assert delivery.response_code == 200
    assert delivery.delivered_at is not None

    sent = route.calls.last.request
    body = json.loads(sent.content)
    assert body["event"] == "lead.claimed"
    assert body["data"] == {"id": "42"}
    assert sent.headers["X-LetMeLead-Event"] == "lead.claimed"
    assert sent.headers["X-LetMeLead-Signature"] == webhooks_out.sign("topsecret", sent.content)


@respx.mock
async def test_deliver_http_failure_marks_failed(session, tenant):
    hook = _hook(session, tenant, "https://bad.example/hook")
    delivery = WebhookDelivery(webhook_id=hook.id, event="lead.created", payload={}, status="pending")
    session.add(delivery)
    session.commit()

    respx.post("https://bad.example/hook").mock(return_value=httpx.Response(500))

    assert await webhooks_out.deliver(delivery, hook) is False
    assert delivery.status == "failed"
    assert delivery.attempts == 1
    assert delivery.response_code == 500
    assert delivery.error == "HTTP 500"
    assert delivery.delivered_at is None


@respx.mock
async def test_deliver_transport_error_marks_failed(session, tenant):
    hook = _hook(session, tenant, "https://down.example/hook")
    delivery = WebhookDelivery(webhook_id=hook.id, event="lead.created", payload={}, status="pending")
    session.add(delivery)
    session.commit()

    respx.post("https://down.example/hook").mock(side_effect=httpx.ConnectError("connection refused"))

    assert await webhooks_out.deliver(delivery, hook) is False
    assert delivery.status == "failed"
    assert delivery.response_code is None
    assert "connection refused" in (delivery.error or "")


def test_events_vocabulary_is_the_contract(session):
    # Consumers subscribe to these names; keep them stable or bump deliberately.
    assert set(webhooks_out.EVENTS) == {"lead.created", "lead.claimed", "reply.received"}
    assert db_module is not None  # harness import guard
