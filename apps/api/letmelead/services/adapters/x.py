"""X / Twitter adapter — official API v2 bearer token only.

No scraping of logged-in sessions: the X API is the supported path.
"""

from __future__ import annotations

import asyncio
from typing import Any
from urllib.parse import quote

from ...config import settings
from ..intent import classify
from .base import RawSignal, SourceAdapter, SourceUnavailable, TargetRef, cutoff, parse_date


class XAdapter(SourceAdapter):
    kind = "x"
    label = "X / Twitter posts"
    requires = "X_BEARER_TOKEN"

    def available(self) -> bool:
        return bool(settings.x_bearer_token)

    async def fetch(self, targets: list[TargetRef], config: dict[str, Any]) -> list[RawSignal]:
        if not settings.x_bearer_token:
            raise SourceUnavailable("X_BEARER_TOKEN is not configured")
        since = cutoff()
        out: list[RawSignal] = []
        for target in targets[:15]:
            query = (
                f'"{target.company}" (recommend OR alternative OR switch OR problem OR migration) '
                "-is:retweet lang:en"
            )
            url = (
                "https://api.x.com/2/tweets/search/recent"
                f"?query={quote(query)}"
                "&max_results=25&tweet.fields=created_at,author_id,public_metrics"
            )
            data = await self.get_json(url, headers={"Authorization": f"Bearer {settings.x_bearer_token}"})
            for tweet in (data or {}).get("data", []) or []:
                published = parse_date(tweet.get("created_at"))
                if published and published < since:
                    continue
                signal_type, strength = classify(tweet.get("text", ""))
                if signal_type == "other":
                    continue
                out.append(
                    RawSignal(
                        source=self.kind,
                        type=signal_type,
                        strength=strength,
                        title=tweet.get("text", "")[:300],
                        company=target.company,
                        domain=target.domain,
                        url=f"https://x.com/i/web/status/{tweet.get('id')}",
                        published_at=published,
                        detail={"author_id": tweet.get("author_id"), "metrics": tweet.get("public_metrics")},
                    )
                )
            await asyncio.sleep(0.8)
        return out
