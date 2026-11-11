"""The signal catalog API: grouped read and per-tenant toggles that sync adapters."""

from __future__ import annotations

import uuid

import sqlalchemy as sa
from letmelead.models import Source, TenantSignal
from letmelead.signals_catalog import BY_HAND, CATALOG, CATEGORIES, LIVE, PARTLY


def _categories(client, headers):
    res = client.get("/v1/signals/catalog", headers=headers)
    assert res.status_code == 200, res.text
    return res.json()


def test_catalog_shape_and_count(client, account):
    data = _categories(client, account["headers"])
    flat = [s for c in data["categories"] for s in c["signals"]]
    assert len(flat) == len(CATALOG)
    assert {c["id"] for c in data["categories"]} == {c.id for c in CATEGORIES}
    legend = data["legend"]
    assert set(legend) == {LIVE, PARTLY, BY_HAND}
    for signal in flat:
        assert signal["label"] and signal["description"] and signal["why_now"] and signal["how_it_works"]
        assert signal["status"] in {LIVE, PARTLY, BY_HAND}
        assert signal["status_label"]


def test_every_automatic_signal_maps_to_a_real_adapter():
    for signal in CATALOG.values():
        if signal.automatic:
            assert signal.adapters, f"{signal.id} is automatic but has no adapters"
        elif signal.adapters:
            raise AssertionError(f"{signal.id} is by-hand but lists adapters")


def test_defaults_follow_the_default_adapters(client, account):
    data = _categories(client, account["headers"])
    flat = {s["id"]: s for c in data["categories"] for s in c["signals"]}
    on = [s for s in flat.values() if s["enabled"]]
    assert on, "a fresh tenant must start with some signals on"
    for signal in flat.values():
        expected = signal["status"] != BY_HAND and bool(set(signal["adapters"]) & {"news", "job_board", "reddit"})
        assert signal["enabled"] == expected, signal["id"]


def test_toggle_persists_and_syncs_adapters(client, account, session):
    headers = account["headers"]
    tenant_id = uuid.UUID(account["tenant_id"])
    # The API commits in its own session; end this session's read snapshot
    # before re-reading so we see the committed state.
    def news_sources():
        session.rollback()
        return session.scalars(
            sa.select(Source).where(Source.tenant_id == tenant_id, Source.kind == "news")
        ).all()

    def news_signals_on():
        data = _categories(client, headers)
        flat = [s for c in data["categories"] for s in c["signals"]]
        return [s["id"] for s in flat if s["enabled"] and "news" in s["adapters"]]

    # just_raised_money maps to news, but other news-backed signals are still
    # on — so the adapter must stay on.
    res = client.put("/v1/signals/just_raised_money", json={"enabled": False}, headers=headers)
    assert res.status_code == 200, res.text
    row = session.scalar(
        sa.select(TenantSignal).where(
            TenantSignal.tenant_id == tenant_id, TenantSignal.signal_id == "just_raised_money"
        )
    )
    assert row is not None and row.enabled is False
    assert "just_raised_money" not in news_signals_on()
    assert news_signals_on(), "other news-backed signals remain on"

    # Turning off every news-backed signal switches the adapter off…
    for signal_id in news_signals_on():
        res = client.put(f"/v1/signals/{signal_id}", json={"enabled": False}, headers=headers)
        assert res.status_code == 200, res.text
    assert news_signals_on() == []
    assert all(not s.enabled for s in news_sources()), "news should be off with no enabled signal needing it"

    # …and re-enabling one news-backed signal brings the adapter back, ready to scan.
    res = client.put("/v1/signals/describing_problem", json={"enabled": True}, headers=headers)
    assert res.status_code == 200
    assert any(s.enabled for s in news_sources())


def test_by_hand_signals_cannot_be_enabled(client, account):
    headers = account["headers"]
    res = client.put("/v1/signals/engages_with_your_posts", json={"enabled": True}, headers=headers)
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "not_automatic"


def test_unknown_signal_is_404(client, account):
    res = client.put("/v1/signals/does_not_exist", json={"enabled": True}, headers=account["headers"])
    assert res.status_code == 404


def test_overrides_are_per_tenant(client, account):
    # A second tenant sees its own defaults, not the first tenant's overrides.
    other = client.post(
        "/v1/auth/signup",
        json={"email": "other-tenant@example.com", "password": "correct-horse-battery", "name": "Other"},
    )
    assert other.status_code == 201, other.text
    headers = {"Authorization": f"Bearer {other.json()['access_token']}"}
    data = _categories(client, headers)
    flat = {s["id"]: s["enabled"] for c in data["categories"] for s in c["signals"]}
    assert flat["just_raised_money"] is True  # catalog default, unrelated to the first tenant
