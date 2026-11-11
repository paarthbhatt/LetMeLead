"""Credits ledger invariants: append-only, correct running balance, idempotent claims."""

from __future__ import annotations

import uuid

import pytest
import sqlalchemy as sa
from letmelead import credits
from letmelead.config import settings
from letmelead.errors import ApiError
from letmelead.models import CreditsLedger, Tenant


def _tenant(session) -> Tenant:
    tenant = Tenant(name="Ledger Co", slug=f"ledger-{uuid.uuid4().hex[:6]}")
    session.add(tenant)
    session.commit()
    return tenant


def test_balance_is_running_sum(session):
    tenant = _tenant(session)
    credits.append(session, tenant.id, 100, "top-up: 100 credits")
    credits.append(session, tenant.id, -3, "claimed lead: Acme")
    credits.append(session, tenant.id, 0, "free lead 1/10")
    session.commit()

    rows = session.scalars(
        sa.select(CreditsLedger).where(CreditsLedger.tenant_id == tenant.id).order_by(CreditsLedger.created_at)
    ).all()
    running = 0
    for row in rows:
        running += row.delta
        assert row.balance_after == running
    assert credits.balance(session, tenant.id) == 97


def test_negative_balance_is_refused(session):
    tenant = _tenant(session)
    with pytest.raises(ApiError) as err:
        credits.append(session, tenant.id, -1, "claimed lead: Acme")
    assert err.value.code == "insufficient_credits"
    assert err.value.status_code == 402


def test_idempotency_key_returns_existing_row(session):
    tenant = _tenant(session)
    first = credits.append(session, tenant.id, 50, "top-up", idempotency_key="order:1")
    second = credits.append(session, tenant.id, 50, "top-up", idempotency_key="order:1")
    session.commit()
    assert first.id == second.id
    assert credits.balance(session, tenant.id) == 50


def test_first_claims_are_free_then_charged(session):
    tenant = _tenant(session)
    for index in range(settings.free_leads_per_tenant):
        charged, was_free = credits.claim_charge(session, tenant.id, uuid.uuid4(), f"Lead {index}")
        assert (charged, was_free) == (0, True)

    credits.append(session, tenant.id, 10, "top-up: 10 credits")
    charged, was_free = credits.claim_charge(session, tenant.id, uuid.uuid4(), "Lead over the limit")
    assert was_free is False
    assert charged == settings.lead_price_credits
    assert credits.balance(session, tenant.id) == 10 - settings.lead_price_credits


def test_free_claims_without_balance_do_not_go_negative(session):
    """After the free allowance, a zero balance must ask for a top-up rather than overdraw."""
    tenant = _tenant(session)
    for index in range(settings.free_leads_per_tenant):
        credits.claim_charge(session, tenant.id, uuid.uuid4(), f"Lead {index}")
    with pytest.raises(ApiError) as err:
        credits.claim_charge(session, tenant.id, uuid.uuid4(), "One too many")
    assert err.value.code == "insufficient_credits"
    assert credits.balance(session, tenant.id) == 0
