"""Common adapter interface.

Adapters only collect and normalise. Scoring, qualification and persistence live in
the engine so every source gets identical treatment.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

from ...config import settings

logger = logging.getLogger("letmelead.adapters")

USER_AGENT = "LetMeLead/1.0 (+https://letmelead.app; contact: ops@letmelead.app)"


class SourceUnavailable(RuntimeError):
    """The source needs credentials that are not configured."""


class SourceBlocked(RuntimeError):
    """The source refused the request (bot protection / rate limit). Never bypassed."""


@dataclass
class RawSignal:
    source: str
    type: str
    title: str
    company: str
    domain: str
    url: str | None = None
    published_at: datetime | None = None
    strength: str = "normal"
    detail: dict[str, Any] = field(default_factory=dict)

    def fingerprint(self, tenant_id: Any) -> str:
        # Stable across runs: the same outlet article is never stored twice.
        raw = f"{tenant_id}|{self.domain}|{self.type}|{self.url or ''}|{self.title[:180]}"
        return hashlib.sha1(raw.encode()).hexdigest()


@dataclass
class TargetRef:
    company: str
    domain: str
    country: str | None = None
    employer: str | None = None
    news_query: str | None = None
    careers_url: str | None = None


class SourceAdapter(ABC):
    kind: str
    label: str
    requires: str = "none"

    def available(self) -> bool:
        return True

    @abstractmethod
    async def fetch(self, targets: list[TargetRef], config: dict[str, Any]) -> list[RawSignal]:
        """Return normalised signals for the given targets. Must not raise for one bad target."""

    # -- helpers -------------------------------------------------------------

    async def get_json(self, url: str, *, headers: dict[str, str] | None = None, retries: int = 2) -> Any:
        last_error: Exception | None = None
        for attempt in range(retries + 1):
            try:
                async with httpx.AsyncClient(
                    timeout=25, headers={"User-Agent": USER_AGENT, **(headers or {})}, follow_redirects=True
                ) as client:
                    res = await client.get(url)
                if res.status_code in (403, 429):
                    raise SourceBlocked(f"{self.kind}: HTTP {res.status_code} (blocked or rate limited)")
                if res.status_code >= 500:
                    raise httpx.HTTPStatusError(f"HTTP {res.status_code}", request=res.request, response=res)
                res.raise_for_status()
                return res.json()
            except SourceBlocked:
                raise
            except (httpx.HTTPError, ValueError) as exc:
                last_error = exc
                if attempt < retries:
                    await asyncio.sleep(1.5 * (attempt + 1))
        logger.warning("adapter_fetch_failed", extra={"source": self.kind, "error": str(last_error)})
        return None

    async def get_text(self, url: str, *, headers: dict[str, str] | None = None) -> str | None:
        try:
            async with httpx.AsyncClient(
                timeout=25, headers={"User-Agent": USER_AGENT, **(headers or {})}, follow_redirects=True
            ) as client:
                res = await client.get(url)
            if res.status_code in (403, 429):
                raise SourceBlocked(f"{self.kind}: HTTP {res.status_code} (blocked or rate limited)")
            if res.status_code != 200:
                return None
            return res.text
        except httpx.HTTPError:
            return None


def cutoff(days: int | None = None) -> datetime:
    return datetime.now(UTC) - timedelta(days=days or settings.signal_max_age_days)


def parse_date(value: Any) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        seconds = value / 1000 if value > 10_000_000_000 else value
        return datetime.fromtimestamp(seconds, tz=UTC)
    text = str(value).strip()
    for candidate in (text, text[:10]):
        try:
            parsed = datetime.fromisoformat(candidate.replace("Z", "+00:00"))
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
        except ValueError:
            continue
    try:
        from email.utils import parsedate_to_datetime

        parsed = parsedate_to_datetime(text)
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
    except (TypeError, ValueError):
        return None
