"""Reddit adapter — public search JSON, no credentials."""

from __future__ import annotations

import asyncio
from typing import Any
from urllib.parse import quote

from ..intent import classify
from .base import RawSignal, SourceAdapter, TargetRef, cutoff, parse_date

QUERY = '(recommend OR alternative OR "looking for" OR problem OR switching OR migrate)'


class RedditAdapter(SourceAdapter):
    kind = "reddit"
    label = "Reddit discussions"
    requires = "public Reddit search (best-effort)"

    async def fetch(self, targets: list[TargetRef], config: dict[str, Any]) -> list[RawSignal]:
        subreddits: list[str] = config.get("subreddits") or []
        per_target = int(config.get("per_target", 25))
        out: list[RawSignal] = []
        since = cutoff()

        for target in targets[:25]:
            query = f'"{target.company}" {QUERY}'
            if subreddits:
                query += " " + " OR ".join(f"subreddit:{s}" for s in subreddits[:3])
            url = (
                "https://www.reddit.com/search.json"
                f"?q={quote(query)}"
                f"&sort=new&t=month&limit={per_target}&raw_json=1"
            )
            data = await self.get_json(url, retries=1)
            if not data:
                await asyncio.sleep(1.2)
                continue
            for child in (data.get("data") or {}).get("children", []):
                post = child.get("data") or {}
                title = post.get("title") or ""
                body = (post.get("selftext") or "")[:4000]
                published = parse_date(post.get("created_utc"))
                if not title or (published and published < since):
                    continue
                signal_type, strength = classify(f"{title}\n{body}")
                if signal_type == "other":
                    continue
                out.append(
                    RawSignal(
                        source=self.kind,
                        type=signal_type,
                        strength=strength,
                        title=title[:300],
                        company=target.company,
                        domain=target.domain,
                        url=f"https://www.reddit.com{post.get('permalink', '')}",
                        published_at=published,
                        detail={
                            "subreddit": post.get("subreddit"),
                            "score": post.get("score"),
                            "comments": post.get("num_comments"),
                        },
                    )
                )
            await asyncio.sleep(1.2)  # stay polite; Reddit rate-limits aggressively
        return out
