"""Onboarding: turn a website into an ICP brief, and optionally into target companies.

Nothing here is industry-specific. When no LLM is configured the heuristic uses the
page's own title/description and generic buyer roles, and it refuses to build a brief
from a bot-challenge or empty page instead of storing garbage.
"""

from __future__ import annotations

import logging
import re
from typing import Any

import httpx

from ..config import settings
from .adapters.base import USER_AGENT, TargetRef
from .llm import get_llm

logger = logging.getLogger("letmelead.discovery")

CHALLENGE_MARKERS = (
    "just a moment",
    "security checkpoint",
    "enable javascript and cookies",
    "attention required",
    "access denied",
    "captcha",
    "verify you are human",
)

GENERIC_ROLES = [
    "founder",
    "ceo",
    "cto",
    "coo",
    "vp engineering",
    "head of engineering",
    "head of operations",
    "head of marketing",
    "head of sales",
    "head of product",
    "procurement",
]


class BriefError(RuntimeError):
    pass


def strip_html(html: str) -> dict[str, str]:
    title = re.sub(r"\s+", " ", (re.search(r"<title[^>]*>(.*?)</title>", html, re.I | re.S) or [None, ""])[1]).strip()
    description = ""
    for pattern in (
        r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']+)',
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']description["\']',
        r'<meta[^>]+property=["\']og:description["\'][^>]+content=["\']([^"\']+)',
    ):
        match = re.search(pattern, html, re.I)
        if match:
            description = match.group(1).strip()
            break
    text = re.sub(r"<(script|style|noscript)[^>]*>.*?</\1>", " ", html, flags=re.I | re.S)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return {"title": title[:300], "description": description[:600], "text": text[:8000]}


async def fetch_site(url: str) -> dict[str, str]:
    target = url if url.startswith("http") else f"https://{url}"
    try:
        async with httpx.AsyncClient(timeout=20, headers={"User-Agent": USER_AGENT}, follow_redirects=True) as client:
            res = await client.get(target)
    except httpx.HTTPError as exc:
        raise BriefError(f"Could not fetch {target}: {exc}") from exc
    if res.status_code >= 400:
        raise BriefError(f"{target} returned HTTP {res.status_code}")
    page = strip_html(res.text)
    haystack = f"{page['title']} {page['description']}".lower()
    if any(marker in haystack for marker in CHALLENGE_MARKERS):
        raise BriefError(
            f"{target} served a bot-protection page instead of the site. "
            "Open it in a browser and paste your offer manually."
        )
    if len(page["text"]) < 200:
        raise BriefError(f"{target} returned almost no readable text; paste your offer manually.")
    return page


async def build_icp(website: str) -> tuple[dict[str, Any], str]:
    page = await fetch_site(website)
    llm = get_llm()
    if llm.available():
        prompt = f"""Read this company's website and write a concise outbound ICP.

URL: {website}
TITLE: {page['title']}
DESCRIPTION: {page['description']}
TEXT: {page['text'][:6000]}

Return JSON with:
  offer: one sentence describing what they sell
  buyers: 2-5 buyer personas (titles + company type)
  roles: job-title keywords that indicate a buyer (lowercase)
  region: target geography or "Global"
  exclusions: competitors or company types to exclude
Only use what the page supports. Do not invent customers or claims."""
        result = await llm.complete_json("You output only valid JSON.", prompt, max_tokens=600)
        if result and result.get("offer"):
            return (
                {
                    "offer": str(result.get("offer"))[:500],
                    "buyers": [str(b)[:160] for b in (result.get("buyers") or [])][:5],
                    "roles": [str(r).lower()[:80] for r in (result.get("roles") or [])][:10] or GENERIC_ROLES[:5],
                    "region": str(result.get("region") or "Global"),
                    "exclusions": [str(e)[:80] for e in (result.get("exclusions") or [])][:10],
                },
                "llm",
            )

    offer = page["description"] or page["title"] or f"Products from {website}"
    return (
        {
            "offer": offer[:500],
            "buyers": ["Founders and functional leaders at mid-market companies"],
            "roles": GENERIC_ROLES[:6],
            "region": "Global",
            "exclusions": [],
        },
        "heuristic",
    )


def normalize_domain(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"^https?://", "", value).split("/")[0]
    return value.removeprefix("www.")


async def discover_targets(icp: dict[str, Any], limit: int = 20) -> list[TargetRef]:
    """Ask the model for candidate companies, then verify each domain resolves.

    Discovery is intentionally conservative: a domain that does not answer HTTPS is
    dropped rather than guessed at.
    """
    llm = get_llm()
    if not llm.available():
        return []
    prompt = (
        f"List up to {min(limit, 25)} real companies that match this ICP.\n"
        f"OFFER: {icp.get('offer')}\nBUYERS: {', '.join(icp.get('buyers') or [])}\n"
        f"REGION: {icp.get('region')}\n"
        'Return JSON {"companies": [{"company": "Acme", "domain": "acme.com", "country": "US"}]}. '
        "Only include companies whose primary website domain you are confident about."
    )
    result = await llm.complete_json("Output only valid JSON. No commentary.", prompt, max_tokens=800)
    if not result:
        return []
    candidates = []
    for item in (result.get("companies") or [])[: limit * 2]:
        if not isinstance(item, dict):
            continue
        domain = normalize_domain(str(item.get("domain") or ""))
        company = str(item.get("company") or "").strip()
        if not company or domain.count(".") < 1:
            continue
        candidates.append(TargetRef(company=company[:200], domain=domain, country=(item.get("country") or None)))

    verified: list[TargetRef] = []
    async with httpx.AsyncClient(timeout=8, headers={"User-Agent": USER_AGENT}, follow_redirects=True) as client:
        for candidate in candidates:
            if len(verified) >= limit:
                break
            try:
                res = await client.head(f"https://{candidate.domain}")
                if res.status_code < 400:
                    verified.append(candidate)
            except httpx.HTTPError:
                continue
    if not settings.is_production:
        logger.info("discovery_verified", extra={"found": len(verified), "asked": len(candidates)})
    return verified
