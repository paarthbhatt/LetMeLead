"""Facebook Pages adapter — Graph API page posts for monitored pages."""

from __future__ import annotations

from typing import Any

from ...config import settings
from ..intent import classify
from .base import RawSignal, SourceAdapter, SourceUnavailable, TargetRef, cutoff, parse_date


class FacebookAdapter(SourceAdapter):
    kind = "facebook"
    label = "Facebook pages"
    requires = "FB_ACCESS_TOKEN + FB_PAGE_IDS"

    def available(self) -> bool:
        return bool(settings.fb_access_token and settings.fb_page_ids)

    async def fetch(self, targets: list[TargetRef], config: dict[str, Any]) -> list[RawSignal]:
        if not self.available():
            raise SourceUnavailable("FB_ACCESS_TOKEN and FB_PAGE_IDS are required")
        page_ids = [p.strip() for p in (config.get("page_ids") or settings.fb_page_ids).split(",") if p.strip()]
        since = cutoff()
        out: list[RawSignal] = []
        for page_id in page_ids[:20]:
            url = (
                f"https://graph.facebook.com/v21.0/{page_id}/posts"
                "?fields=message,created_time,permalink_url&limit=25"
                f"&access_token={settings.fb_access_token}"
            )
            data = await self.get_json(url, retries=1)
            for post in (data or {}).get("data", []) or []:
                text = post.get("message") or ""
                published = parse_date(post.get("created_time"))
                if not text or (published and published < since):
                    continue
                target = next((t for t in targets if t.company.lower() in text.lower()), None)
                if not target:
                    continue
                signal_type, strength = classify(text)
                if signal_type == "other":
                    continue
                out.append(
                    RawSignal(
                        source=self.kind,
                        type=signal_type,
                        strength=strength,
                        title=text[:300],
                        company=target.company,
                        domain=target.domain,
                        url=post.get("permalink_url"),
                        published_at=published,
                        detail={"page_id": page_id},
                    )
                )
        return out
