"""Human pacing for LinkedIn outreach.

New accounts start at 5 invitations per day and ramp every three days up to the
account/campaign cap. Every send slot also gets random jitter so bursts never look
machine-timed.
"""

from __future__ import annotations

import random
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from ..config import settings


def ramp_cap(days_since_start: int, ceiling: int | None = None) -> int:
    """5/day for the first three days, +5 every three days, capped."""
    ceiling = ceiling or settings.outreach_max_daily_cap
    steps = max(days_since_start, 0) // 3
    return min(settings.outreach_new_account_daily_cap + steps * 5, ceiling)


def current_cap(ramp_started_at: datetime | None, ceiling: int | None = None, now: datetime | None = None) -> int:
    now = now or datetime.now(UTC)
    if not ramp_started_at:
        return settings.outreach_new_account_daily_cap
    if ramp_started_at.tzinfo is None:
        ramp_started_at = ramp_started_at.replace(tzinfo=UTC)
    return ramp_cap((now - ramp_started_at).days, ceiling)


@dataclass
class Slot:
    delay_seconds: int


def next_delay(rng: random.Random | None = None) -> int:
    rng = rng or random.Random()
    return rng.randint(settings.outreach_min_seconds, settings.outreach_max_seconds)


def schedule(n: int, start: datetime | None = None, rng: random.Random | None = None) -> list[datetime]:
    """Spread n sends out with jitter, starting now."""
    rng = rng or random.Random()
    cursor = start or datetime.now(UTC)
    out = []
    for _ in range(n):
        cursor = cursor + timedelta(seconds=next_delay(rng))
        out.append(cursor)
    return out


def withdraw_cutoff(now: datetime | None = None) -> datetime:
    return (now or datetime.now(UTC)) - timedelta(days=settings.outreach_withdraw_after_days)


def is_send_window(now: datetime | None = None) -> bool:
    """Only send on weekdays during reasonable business hours (UTC)."""
    now = now or datetime.now(UTC)
    return now.weekday() < 5 and 7 <= now.hour <= 19
