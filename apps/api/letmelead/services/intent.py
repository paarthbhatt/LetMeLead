"""Intent detection: deterministic regex first, LLM classifier as a second opinion.

Signal types are the same vocabulary the scoring table uses.
"""

from __future__ import annotations

import logging
import re
from typing import Any

from .llm import get_llm

logger = logging.getLogger("letmelead.intent")

PATTERNS: dict[str, re.Pattern[str]] = {
    "issue_experienced": re.compile(
        r"\b(problem|issue|struggl|frustrat|fail(ed|ing)?|broken|bug|outage|downtime|slow|"
        r"cannot|cant|can't|losing|hate|painful)\b",
        re.I,
    ),
    "vendor_switch": re.compile(
        r"\b(switch(ing|ed)?|migrat(e|ing|ed)|replac(e|ing|ed)|alternative(s)? (to|for)|"
        r"instead of|moving off|dropping|churn(ed|ing)?|cancel(l)?ed)\b",
        re.I,
    ),
    "recommendation_request": re.compile(
        r"\b(recommend(ations?|ed)?|anyone (using|tried|know)|looking for (a|an|the)|"
        r"what (do|would) you (use|recommend)|suggestions? for|best .{0,30} for)\b",
        re.I,
    ),
    "hiring_signal": re.compile(
        r"\b(hiring|job opening|we're looking for|join our team|open role|recruiting)\b", re.I
    ),
    "funding_or_mna": re.compile(
        r"\b(raises?|raised|funding round|series [a-e]\b|seed round|acqui(re|red|sition)|merger|"
        r"investment|valuation)\b",
        re.I,
    ),
    "leadership_change": re.compile(
        r"\b(appoint(ed|s)?|new (ceo|cto|ciso|cmo|coo|vp|head of)|joins as|steps down|"
        r"promoted to|names? (a )?new)\b",
        re.I,
    ),
    "review_complaint": re.compile(r"\b(terrible|awful|worst|refund|support (never|doesn't|does not)|rip.?off)\b", re.I),
}

TYPE_POINTS: dict[str, float] = {
    "issue_experienced": 3.0,
    "vendor_switch": 3.0,
    "recommendation_request": 3.0,
    "hiring_signal": 2.5,
    "funding_or_mna": 2.5,
    "leadership_change": 2.0,
    "review_complaint": 1.0,
    "other": 0.0,
}

WEAK_MARKERS = re.compile(r"\b(maybe|might|not sure|question|anyone else|survey|hiring)\b", re.I)


def classify(text: str) -> tuple[str, str]:
    """Return (signal_type, strength). Deterministic and cheap."""
    if not text.strip():
        return "other", "weak"
    hits = [name for name, rx in PATTERNS.items() if rx.search(text)]
    if not hits:
        return "other", "weak"
    # recommendation/switch intents outrank generic problem talk
    order = ["vendor_switch", "recommendation_request", "issue_experienced", "hiring_signal", "funding_or_mna",
             "leadership_change", "review_complaint"]
    hits.sort(key=order.index)
    signal_type = hits[0]
    strength = "strong" if signal_type in {"vendor_switch", "recommendation_request"} and len(hits) > 1 else "normal"
    if WEAK_MARKERS.search(text) and strength != "strong":
        strength = "weak"
    return signal_type, strength


async def classify_with_llm(text: str, icp: dict[str, Any]) -> dict[str, Any] | None:
    """Optional second opinion. Returns {is_signal, type, strength, why} or None."""
    llm = get_llm()
    if not llm.available():
        return None
    offer = icp.get("offer") or "B2B software"
    buyers = ", ".join(icp.get("buyers") or []) or "business teams"
    prompt = (
        "Classify this public post as a buying signal for the seller below.\n"
        f"SELLER OFFER: {offer}\nSELLER BUYERS: {buyers}\n"
        f"POST: {text[:1200]}\n\n"
        'Return JSON: {"is_signal": bool, "type": one of '
        '["issue_experienced","vendor_switch","recommendation_request","hiring_signal",'
        '"funding_or_mna","leadership_change","review_complaint","other"], '
        '"strength": "strong"|"normal"|"weak", "why": "one sentence"}'
    )
    result = await llm.complete_json("You output only valid JSON. Be strict.", prompt, max_tokens=200)
    if not result or not isinstance(result.get("is_signal"), bool):
        return None
    if result.get("type") not in TYPE_POINTS:
        result["type"] = "other"
    if result.get("strength") not in {"strong", "normal", "weak"}:
        result["strength"] = "normal"
    return result
