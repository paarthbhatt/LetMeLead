"""End-to-end API flow: signup → lead → claim → campaign → reply stops the sequence."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import sqlalchemy as sa
from letmelead.models import Lead, LeadSignal, Message, Signal


def _make_lead(session, tenant_id, *, domain: str = "acme.com", company: str = "Acme") -> Lead:
    lead = Lead(
        tenant_id=tenant_id,
        company=company,
        domain=domain,
        reason="looking to switch vendors: “We are evaluating compliance vendors” (2d ago, reddit)",
        status="new",
        fit="fit",
        fit_confidence=0.8,
        fit_reason="Evidence names a vendor switch.",
        fit_evidence={"used_evidence": ["We are evaluating compliance vendors"]},
        verification_status="verified",
        score=4.2,
        signal_at=datetime.now(UTC),
        signal_age_days=2,
        linkedin_url=f"https://www.linkedin.com/in/{domain.split('.')[0]}-ops",
    )
    session.add(lead)
    session.flush()
    signal = Signal(
        tenant_id=tenant_id,
        source="reddit",
        type="vendor_switch",
        strength="strong",
        title="We are evaluating compliance vendors",
        url=f"https://reddit.com/r/saas/{uuid.uuid4().hex[:6]}",
        published_at=datetime.now(UTC),
        points=4.2,
        fingerprint=f"test|{domain}|{uuid.uuid4().hex}",
        detail={"subreddit": "r/saas"},
    )
    session.add(signal)
    session.flush()
    session.add(LeadSignal(lead_id=lead.id, signal_id=signal.id, points=4.2))
    session.commit()
    return lead


def test_signup_creates_tenant_and_owner(client):
    res = client.post(
        "/v1/auth/signup",
        json={"email": f"owner-{uuid.uuid4().hex[:8]}@example.com", "password": "correct-horse-battery"},
    )
    assert res.status_code == 201
    token = res.json()["access_token"]
    me = client.get("/v1/auth/me", headers={"Authorization": f"Bearer {token}"}).json()
    assert me["tenants"][0]["role"] == "owner"
    assert me["active_tenant_id"]


def test_tenant_isolation(client, account, session):
    """Another tenant's lead must not be readable."""
    other = client.post(
        "/v1/auth/signup",
        json={"email": f"other-{uuid.uuid4().hex[:8]}@example.com", "password": "correct-horse-battery"},
    ).json()
    other_headers = {"Authorization": f"Bearer {other['access_token']}"}
    other_tenant = client.get("/v1/auth/me", headers=other_headers).json()["active_tenant_id"]
    foreign = _make_lead(session, uuid.UUID(other_tenant), domain="notmine.com", company="Not Mine")

    res = client.get(f"/v1/leads/{foreign.id}", headers=account["headers"])
    assert res.status_code == 404
    listing = client.get("/v1/leads", headers=account["headers"]).json()
    assert all(item["domain"] != "notmine.com" for item in listing["items"])


def test_claim_lead_charges_credits_once(client, account, session):
    lead = _make_lead(session, uuid.UUID(account["tenant_id"]))
    res = client.post(f"/v1/leads/{lead.id}/claim", headers=account["headers"], json={})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["was_free"] is True
    assert body["credits_charged"] == 0

    first = client.get("/v1/credits", headers=account["headers"]).json()
    assert first["free_leads_used"] == 1

    # Claiming twice is refused, and the ledger is not charged again.
    again = client.post(f"/v1/leads/{lead.id}/claim", headers=account["headers"], json={})
    assert again.status_code == 409
    assert again.json()["error"]["code"] == "already_claimed"
    assert client.get("/v1/credits", headers=account["headers"]).json()["free_leads_used"] == 1


def test_campaign_flow_and_reply_stops_sequence(client, account, session):
    tenant_id = uuid.UUID(account["tenant_id"])
    lead = _make_lead(session, tenant_id)

    created = client.post(
        "/v1/campaigns", headers=account["headers"], json={"name": "Q4 push", "lead_ids": [str(lead.id)]}
    )
    assert created.status_code == 201, created.text
    campaign = created.json()
    assert campaign["sequence"]["steps"][0]["kind"] == "connect"

    preview = client.get(
        f"/v1/campaigns/{campaign['id']}/preview/{lead.id}", headers=account["headers"]
    )
    assert preview.status_code == 200
    assert "Acme" in preview.json()["body"] or "compliance" in preview.json()["body"].lower()

    queued = client.post(
        f"/v1/campaigns/{campaign['id']}/queue", headers=account["headers"], json={"lead_ids": [str(lead.id)]}
    )
    assert queued.status_code == 200, queued.text

    reply = client.post(
        "/v1/replies/ingest",
        headers=account["headers"],
        json={"lead_id": str(lead.id), "campaign_id": campaign["id"], "body": "Tell me more about onboarding."},
    )
    assert reply.status_code == 201, reply.text

    session.expire_all()
    statuses = session.scalars(sa.select(Message.status).where(Message.lead_id == lead.id)).all()
    assert statuses and all(status == "skipped" for status in statuses)
    assert session.get(Lead, lead.id).status == "replied"

    inbox = client.get("/v1/replies", headers=account["headers"]).json()
    assert inbox["items"][0]["body"].startswith("Tell me more")


def test_pause_campaign_is_immediate(client, account):
    campaign = client.post("/v1/campaigns", headers=account["headers"], json={"name": "Pausable"}).json()
    paused = client.post(
        f"/v1/campaigns/{campaign['id']}/pause", headers=account["headers"], json={"reason": "reviewing copy"}
    )
    assert paused.status_code == 200
    assert paused.json()["status"] == "paused"
    assert paused.json()["pause_reason"] == "reviewing copy"


def test_api_key_auth_scopes_to_tenant(client, account):
    created = client.post(
        "/v1/tenant/api-keys", headers=account["headers"], json={"name": "agent"}
    )
    assert created.status_code == 201, created.text
    key = created.json()["api_key"]

    res = client.get("/v1/tenant", headers={"X-API-Key": key})
    assert res.status_code == 200
    assert res.json()["id"] == account["tenant_id"]

    assert client.get("/v1/tenant").status_code == 401
