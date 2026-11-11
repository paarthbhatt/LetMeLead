"""Google Maps / Places adapter — finds local businesses matching the ICP query."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import httpx

from ...config import settings
from .base import USER_AGENT, RawSignal, SourceAdapter, SourceUnavailable, TargetRef


class GoogleMapsAdapter(SourceAdapter):
    kind = "google_maps"
    label = "Google Maps businesses"
    requires = "GOOGLE_MAPS_API_KEY + MAPS_QUERY"

    def available(self) -> bool:
        return bool(settings.google_maps_api_key and settings.maps_query)

    async def fetch(self, targets: list[TargetRef], config: dict[str, Any]) -> list[RawSignal]:
        if not settings.google_maps_api_key:
            raise SourceUnavailable("GOOGLE_MAPS_API_KEY is not configured")
        query = config.get("query") or settings.maps_query
        if not query:
            raise SourceUnavailable("MAPS_QUERY is not configured")
        payload = {"textQuery": query, "pageSize": min(int(config.get("page_size", 20)), 20)}
        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": settings.google_maps_api_key,
            "X-Goog-FieldMask": (
                "places.displayName,places.websiteUri,places.formattedAddress,"
                "places.userRatingCount,places.rating,places.googleMapsUri"
            ),
            "User-Agent": USER_AGENT,
        }
        async with httpx.AsyncClient(timeout=25) as client:
            res = await client.post(
                "https://places.googleapis.com/v1/places:searchText", headers=headers, json=payload
            )
        if res.status_code >= 400:
            raise SourceUnavailable(f"Places API HTTP {res.status_code}: {res.text[:200]}")

        out: list[RawSignal] = []
        for place in res.json().get("places", []):
            name = (place.get("displayName") or {}).get("text", "")
            website = place.get("websiteUri") or ""
            domain = website.split("//")[-1].split("/")[0].removeprefix("www.")
            target = next(
                (t for t in targets if t.domain and t.domain in website) , None
            ) or next((t for t in targets if name.lower() in t.company.lower() or t.company.lower() in name.lower()),
                      None)
            if not target:
                continue
            out.append(
                RawSignal(
                    source=self.kind,
                    type="local_presence",
                    strength="weak",
                    title=f"Listed on Google Maps: {name}"
                    + (f" — {place['formattedAddress']}" if place.get("formattedAddress") else ""),
                    company=target.company,
                    domain=target.domain or domain,
                    url=place.get("googleMapsUri"),
                    published_at=datetime.now(UTC),
                    detail={"rating": place.get("rating"), "reviews": place.get("userRatingCount")},
                )
            )
        return out
