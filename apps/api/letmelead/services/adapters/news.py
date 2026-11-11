"""News adapter — Google News RSS per target.

News is the richest free source of funding, leadership and relaunch signals.
The feed is read at low volume for a company's own research, as Google asks.
"""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import quote
from xml.etree import ElementTree

from ..intent import classify
from .base import RawSignal, SourceAdapter, TargetRef, cutoff

RSS = "https://news.google.com/rss/search?q={query}&hl=en-US&gl=US&ceid=US:en"

# Headlines that are about someone else holding the same name are the classic
# false positive; drop the obvious ones before they reach qualification.
NOISE = re.compile(r"\b(obituary|review of the book|stock (price|market)|how to|opinion:)\b", re.I)


class NewsAdapter(SourceAdapter):
    kind = "news"
    label = "Company news"
    requires = "public Google News RSS (no key)"

    async def fetch(self, targets: list[TargetRef], config: dict[str, Any]) -> list[RawSignal]:
        days = int(config.get("lookback_days", 90))
        since = cutoff(days)
        out: list[RawSignal] = []
        for target in targets[:40]:
            query = target.news_query or f'"{target.company}" when:{days}d'
            text = await self.get_text(RSS.format(query=quote(query)))
            if not text:
                continue
            try:
                root = ElementTree.fromstring(text)
            except ElementTree.ParseError:
                continue
            seen: set[str] = set()
            for item in root.iter("item"):
                title = (item.findtext("title") or "").strip()
                if not title or title in seen or NOISE.search(title):
                    continue
                seen.add(title)
                if target.company.lower() not in title.lower():
                    continue  # namesake guard: the company must be named in the headline
                signal_type, strength = classify(title)
                if signal_type == "other":
                    continue
                published = self._date(item.findtext("pubDate"))
                if published and published < since:
                    continue
                out.append(
                    RawSignal(
                        source=self.kind,
                        type=signal_type,
                        strength=strength,
                        title=title[:300],
                        company=target.company,
                        domain=target.domain,
                        url=item.findtext("link"),
                        published_at=published,
                        detail={"publisher": item.findtext("source"), "query": query},
                    )
                )
        return out

    @staticmethod
    def _date(value: str | None):
        from email.utils import parsedate_to_datetime

        if not value:
            return None
        try:
            return parsedate_to_datetime(value)
        except (TypeError, ValueError):
            return None
