"""Qualification: evidence-based, never silently rejecting, limitations recorded."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from letmelead.services.adapters.base import RawSignal
from letmelead.services.qualification import heuristic_fit, qualify

ICP = {
    "offer": "Managed SOC 2 readiness and continuous compliance monitoring for SaaS teams.",
    "buyers": ["CTOs at Series A-C SaaS"],
    "roles": ["security", "compliance", "engineering"],
    "region": "US and EU",
    "exclusions": ["consultancies"],
}


def _signal(title: str, kind: str = "vendor_switch") -> RawSignal:
    return RawSignal(
        source="reddit", type=kind, title=title, company="Acme", domain="acme.com",
        url="https://example.com/1", published_at=datetime.now(UTC), strength="strong",
    )


def test_heuristic_matches_offer_keywords():
    result = heuristic_fit(ICP, [_signal("We need a compliance vendor for our SOC 2 audit")])
    assert result.fit is True
    assert "compliance" in result.reason.lower()
    assert result.decided is False


def test_heuristic_without_evidence_does_not_reject_hard():
    result = heuristic_fit(ICP, [_signal("We hired a new office manager", kind="leadership_change")])
    assert result.fit is False
    assert result.decided is False
    assert result.limitations


def test_qualify_falls_back_to_heuristics_without_an_llm(monkeypatch):
    from letmelead.services import qualification

    class NoLlm:
        name = "none"
        available = lambda self: False  # noqa: E731

    monkeypatch.setattr(qualification, "get_llm", lambda: NoLlm())

    async def run():
        return await qualify(ICP, "Acme", "acme.com", [_signal("compliance audit pain")])

    result = pytest.importorskip("asyncio").run(run())
    assert result.fit is True
    assert result.decided is False
