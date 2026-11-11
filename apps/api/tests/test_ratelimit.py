"""Rate limiting semantics on the in-memory fallback path.

The harness pins an unreachable REDIS_URL (see conftest) so these always exercise
the deterministic in-memory window, which shares semantics with the Redis path.
"""

from __future__ import annotations

import uuid

from letmelead import ratelimit


def _bucket() -> str:
    return f"rl-test-{uuid.uuid4().hex}"


def test_allows_within_limit():
    bucket = _bucket()
    for _ in range(3):
        allowed, retry = ratelimit.check(bucket, limit=3, window_seconds=60)
        assert allowed
        assert retry == 0


def test_denies_over_limit():
    bucket = _bucket()
    results = [ratelimit.check(bucket, limit=2, window_seconds=60) for _ in range(3)]
    assert [allowed for allowed, _ in results] == [True, True, False]
    denied = results[2]
    assert denied[1] > 0  # caller is told when to retry


def test_buckets_are_independent():
    a, b = _bucket(), _bucket()
    assert ratelimit.check(a, limit=1, window_seconds=60)[0]
    assert ratelimit.check(b, limit=1, window_seconds=60)[0]
    assert not ratelimit.check(a, limit=1, window_seconds=60)[0]
