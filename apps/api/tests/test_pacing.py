"""Pacing: slow ramp, bounded jitter, no weekend bursts."""

from __future__ import annotations

import random
from datetime import UTC, datetime, timedelta

from letmelead.config import settings
from letmelead.services.pacing import current_cap, is_send_window, next_delay, ramp_cap, schedule


def test_ramp_starts_at_five_and_grows_every_three_days():
    assert ramp_cap(0) == settings.outreach_new_account_daily_cap
    assert ramp_cap(2) == settings.outreach_new_account_daily_cap
    assert ramp_cap(3) == 10
    assert ramp_cap(30) == settings.outreach_max_daily_cap


def test_ramp_never_exceeds_the_ceiling():
    assert ramp_cap(365, ceiling=7) == 7


def test_current_cap_without_connect_date_is_the_new_account_cap():
    assert current_cap(None) == settings.outreach_new_account_daily_cap


def test_current_cap_uses_connection_age():
    started = datetime.now(UTC) - timedelta(days=9)
    assert current_cap(started) == 20


def test_delay_is_inside_the_configured_window():
    rng = random.Random(7)
    for _ in range(50):
        delay = next_delay(rng)
        assert settings.outreach_min_seconds <= delay <= settings.outreach_max_seconds


def test_schedule_is_monotonic_and_jittered():
    slots = schedule(8, rng=random.Random(11))
    assert len(slots) == 8
    assert slots == sorted(slots)
    gaps = {round((b - a).total_seconds()) for a, b in zip(slots, slots[1:], strict=False)}
    assert len(gaps) > 1  # not a machine-timed burst


def test_no_sending_on_weekends_or_at_night():
    assert not is_send_window(datetime(2026, 11, 14, 12, tzinfo=UTC))  # Saturday
    assert not is_send_window(datetime(2026, 11, 16, 3, tzinfo=UTC))  # Monday 03:00
    assert is_send_window(datetime(2026, 11, 16, 10, tzinfo=UTC))
