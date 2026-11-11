"""Review-feed adapter.

Consumes a JSON feed of reviews. The feed contract is intentionally simple so a
tenant (or a partner) can plug in G2, Trustpilot, Capterra or an internal export:

    [{"company": "Acme", "domain": "acme.com", "date": "2026-10-01",
      "rating": 2, "url": "https://…", "summary": "support never answers"}]

Only low ratings (<= 3) become signals: a five-star review is not a reason to buy.
"""

from __future__ import annotations

from typing import Any

from ...config import settings
from .base import RawSignal, SourceAdapter, SourceUnavailable, TargetRef, cutoff, parse_date


class ReviewsAdapter(SourceAdapter):
    kind = "reviews"
    label = "Review sites"
    requires = "REVIEWS_FEED_URL (JSON)"

    def available(self) -> bool:
        return bool(settings.reviews_feed_url)

    async def fetch(self, targets: list[TargetRef], config: dict[str, Any]) -> list[RawSignal]:
        feed = config.get("feed_url") or settings.reviews_feed_url
        if not feed:
            raise SourceUnavailable("REVIEWS_FEED_URL is not configured")
        items = await self.get_json(feed)
        if not isinstance(items, list):
            raise SourceUnavailable("review feed did not return a JSON array")
        since = cutoff()
        out: list[RawSignal] = []
        for item in items:
            rating = item.get("rating")
            if isinstance(rating, (int, float)) and rating > 3:
                continue
            published = parse_date(item.get("date"))
            if published and published < since:
                continue
            target = next(
                (
                    t
                    for t in targets
                    if t.domain == (item.get("domain") or "").lower()
                    or t.company.lower() == (item.get("company") or "").lower()
                ),
                None,
            )
            if not target:
                continue
            out.append(
                RawSignal(
                    source=self.kind,
                    type="review_complaint",
                    strength="normal",
                    title=item.get("summary") or f"Low review ({rating}/5)",
                    company=target.company,
                    domain=target.domain,
                    url=item.get("url"),
                    published_at=published,
                    detail={"rating": rating, "feed": feed},
                )
            )
        return out
