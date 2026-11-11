"""Redis-backed sliding-window rate limiting with an in-process fallback.

Limits are per tenant and per route bucket so one noisy agent cannot exhaust the
quota of a browser session (and vice versa).
"""

from __future__ import annotations

import time
from collections import defaultdict, deque

from .config import settings

try:  # Redis is optional for tests and single-process local runs
    import redis

    _redis = redis.Redis.from_url(settings.redis_url, decode_responses=True)
    _redis.ping()
except Exception:  # pragma: no cover - depends on the environment
    _redis = None

_memory: dict[str, deque[float]] = defaultdict(deque)


def check(bucket: str, limit: int, window_seconds: int) -> tuple[bool, int]:
    """Return (allowed, retry_after_seconds)."""
    now = time.time()
    key = f"rl:{bucket}"
    if _redis is not None:  # pragma: no cover - requires redis
        pipe = _redis.pipeline()
        pipe.zremrangebyscore(key, 0, now - window_seconds)
        pipe.zcard(key)
        pipe.zadd(key, {f"{now}-{time.time_ns()}": now})
        pipe.expire(key, window_seconds)
        _, count, *_ = pipe.execute()
        if int(count) >= limit:
            return False, window_seconds
        return True, 0

    window = _memory[key]
    while window and window[0] < now - window_seconds:
        window.popleft()
    if len(window) >= limit:
        return False, window_seconds - int(now - window[0])
    window.append(now)
    return True, 0
