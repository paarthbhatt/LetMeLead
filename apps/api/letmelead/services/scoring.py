"""Signal scoring and de-duplication.

One event covered by ten outlets must count once. The engine therefore collapses
near-duplicate signals per company before scoring, and the reason line only ever
shows distinct evidence.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from datetime import UTC, datetime

from .adapters import RawSignal

# type -> (weight, half-life in days)
WEIGHTS: dict[str, tuple[float, int]] = {
    "issue_experienced": (3.0, 14),
    "vendor_switch": (3.0, 14),
    "recommendation_request": (3.0, 14),
    "hiring_signal": (2.5, 21),
    "funding_or_mna": (2.5, 21),
    "leadership_change": (2.0, 42),
    "local_presence": (1.0, 60),
    "review_complaint": (1.0, 21),
    "other": (0.0, 30),
}
STRENGTH = {"strong": 1.4, "normal": 1.0, "weak": 0.6}
TYPE_CAP = 4.0


@dataclass
class ScoredSignal:
    signal: RawSignal
    points: float
    age_days: int | None


STOPWORDS = {
    "the", "a", "an", "and", "or", "for", "to", "of", "in", "on", "with", "is", "are",
    "its", "it", "as", "at", "by", "from", "new", "how", "why", "what", "this", "that",
}


def _tokens(title: str) -> set[str]:
    words = re.findall(r"[a-z0-9]{3,}", title.lower())
    return {w for w in words if w not in STOPWORDS}


def title_similarity(left: str, right: str) -> float:
    a, b = _tokens(left), _tokens(right)
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def points_for(signal: RawSignal, now: datetime | None = None) -> ScoredSignal:
    now = now or datetime.now(UTC)
    weight, half_life = WEIGHTS.get(signal.type, (0.0, 30))
    if signal.published_at is None:
        return ScoredSignal(signal, 0.0, None)
    age = max((now - signal.published_at).days, 0)
    decay = math.pow(0.5, age / half_life)
    strength = STRENGTH.get(signal.strength, 1.0)
    return ScoredSignal(signal, round(weight * strength * decay, 2), age)


def collapse_duplicates(signals: list[RawSignal], threshold: float = 0.55) -> list[RawSignal]:
    """Keep one signal per real-world event (same company + similar headline)."""
    kept: list[RawSignal] = []
    for candidate in sorted(signals, key=lambda s: s.published_at or datetime.min.replace(tzinfo=UTC), reverse=True):
        duplicate_of = None
        for existing in kept:
            if existing.domain != candidate.domain:
                continue
            if existing.type != candidate.type and title_similarity(existing.title, candidate.title) < 0.7:
                continue
            if title_similarity(existing.title, candidate.title) >= threshold:
                duplicate_of = existing
                break
        if duplicate_of is None:
            kept.append(candidate)
    return kept


@dataclass
class DomainScore:
    company: str
    domain: str
    score: float
    reason: str
    top: ScoredSignal | None
    signals: list[ScoredSignal]


def score_domain(company: str, domain: str, signals: list[ScoredSignal]) -> DomainScore:
    signals = sorted(signals, key=lambda s: s.points, reverse=True)
    per_type: dict[str, float] = {}
    total = 0.0
    for scored in signals:
        cap_used = per_type.get(scored.signal.type, 0.0)
        remaining = max(TYPE_CAP - cap_used, 0.0)
        add = min(scored.points * (0.5 if cap_used else 1.0), remaining)
        per_type[scored.signal.type] = cap_used + add
        total += add

    live = [s for s in signals if s.points > 0]
    distinct_sources = {s.signal.source for s in live}
    total += min(max(len(distinct_sources) - 1, 0) * 0.3, 0.9)

    reason = _reason(live)
    return DomainScore(
        company=company,
        domain=domain,
        score=round(total, 2),
        reason=reason,
        top=live[0] if live else None,
        signals=signals,
    )


TYPE_LABEL = {
    "issue_experienced": "describing the problem you solve",
    "vendor_switch": "looking to switch vendors",
    "recommendation_request": "asking for recommendations",
    "hiring_signal": "hiring for a relevant role",
    "funding_or_mna": "funding or acquisition",
    "leadership_change": "new leadership",
    "local_presence": "visible local presence",
    "review_complaint": "negative public review",
    "other": "mention",
}


def _reason(live: list[ScoredSignal]) -> str:
    if not live:
        return "No current signal"
    parts = []
    for scored in live[:3]:
        signal = scored.signal
        when = signal.published_at.strftime("%d %b %Y") if signal.published_at else "undated"
        headline = signal.title.strip()
        if len(headline) > 130:
            headline = headline[:127] + "…"
        parts.append(f"{TYPE_LABEL.get(signal.type, signal.type)}: “{headline}” ({when}, {signal.source})")
    return " · ".join(parts)
