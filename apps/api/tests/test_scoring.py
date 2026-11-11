"""Signal scoring: decay, duplicate collapse, and a reason line that always cites evidence."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from letmelead.services.adapters.base import RawSignal
from letmelead.services.scoring import collapse_duplicates, points_for, score_domain


def _signal(title: str, *, days_ago: int = 2, kind: str = "issue_experienced", strength: str = "normal",
           source: str = "reddit", domain: str = "acme.com") -> RawSignal:
    return RawSignal(
        company="Acme",
        domain=domain,
        source=source,
        type=kind,
        strength=strength,
        title=title,
        url=f"https://example.com/{abs(hash(title)) % 9999}",
        published_at=datetime.now(UTC) - timedelta(days=days_ago),
        detail={},
    )


def test_points_decay_with_age_and_strength():
    fresh = points_for(_signal("SOC 2 prep is a nightmare", days_ago=0, strength="strong"))
    old = points_for(_signal("SOC 2 prep is a nightmare", days_ago=28, strength="strong"))
    assert fresh.points > old.points
    assert fresh.age_days == 0
    assert old.age_days == 28


def test_undated_signal_scores_zero_but_is_kept():
    sig = _signal("Some mention")
    sig.published_at = None
    scored = points_for(sig)
    assert scored.points == 0.0
    assert scored.age_days is None


def test_duplicate_headlines_collapse_to_one_event():
    a = _signal("Personio acquires Circula to expand spend management", kind="funding_or_mna", source="news")
    b = _signal("Personio acquires Circula to expand spend management", kind="funding_or_mna", source="news")
    c = _signal("Personio acquires Circula, expanding spend management", kind="funding_or_mna", source="news")
    other = _signal("New CISO appointed at Personio", kind="leadership_change", source="news")
    kept = collapse_duplicates([a, b, c, other])
    assert len(kept) == 2


def test_reason_names_the_type_date_and_source():
    signals = [
        points_for(_signal("We are replacing our compliance vendor", kind="vendor_switch", source="reddit")),
        points_for(_signal("Hiring a Security Compliance Manager", kind="hiring_signal", source="job_board")),
    ]
    scored = score_domain("Acme", "acme.com", signals)
    assert scored.score > 0
    assert "reddit" in scored.reason
    assert "Acme" == scored.company
    assert scored.top is not None


def test_repeat_signals_of_one_type_are_capped():
    many = [points_for(_signal(f"Compliance pain number {i}")) for i in range(10)]
    one = [points_for(_signal("Compliance pain number 0"))]
    capped = score_domain("Acme", "acme.com", many)
    single = score_domain("Acme", "acme.com", one)
    assert capped.score < single.score * 10
