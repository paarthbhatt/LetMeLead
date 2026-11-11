"""Qualification engine: is this company a plausible buyer, and who is the buyer?

Two rules the whole system depends on:
  * a qualification always records its evidence and its limitations;
  * the heuristic path never silently rejects anything — only a real LLM decision
    with high confidence is allowed to drop a lead.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Any

from .adapters import RawSignal
from .llm import get_llm

logger = logging.getLogger("letmelead.qualification")


@dataclass
class FitResult:
    fit: bool
    confidence: float
    reason: str
    decided: bool
    evidence: dict[str, Any] = field(default_factory=dict)
    limitations: list[str] = field(default_factory=list)


@dataclass
class DecisionMaker:
    title: str
    name: str | None = None
    linkedin_url: str | None = None
    confidence: float = 0.4


STOP = {"the", "and", "for", "with", "your", "that", "this", "from", "into", "they", "their", "our"}


def _keywords(icp: dict[str, Any]) -> set[str]:
    text = " ".join(
        [
            str(icp.get("offer") or ""),
            " ".join(icp.get("buyers") or []),
            " ".join(icp.get("roles") or []),
        ]
    ).lower()
    return {w for w in re.findall(r"[a-z]{4,}", text) if w not in STOP}


def heuristic_fit(icp: dict[str, Any], signals: list[RawSignal]) -> FitResult:
    keywords = _keywords(icp)
    text = " ".join(f"{s.title} {s.type}" for s in signals).lower()
    hits = sorted({k for k in keywords if k in text})
    strong_types = {"vendor_switch", "recommendation_request", "issue_experienced"}
    topical = any(s.type in strong_types for s in signals)
    fit = bool(hits) and topical
    confidence = 0.25
    if fit:
        confidence = min(0.3 + 0.08 * len(hits) + (0.1 if topical else 0), 0.6)
    return FitResult(
        fit=fit,
        confidence=round(confidence, 2),
        reason=(
            f"Heuristic: matched {', '.join(hits[:5]) or 'no offer keywords'} in the signals."
            if hits
            else "Heuristic: signals do not mention anything from your offer or buyer list."
        ),
        decided=False,
        evidence={"matched_keywords": hits[:10], "signal_types": sorted({s.type for s in signals})},
        limitations=["No LLM configured: qualification is lexical only and never auto-rejects."],
    )


async def llm_fit(
    icp: dict[str, Any], company: str, domain: str, signals: list[RawSignal], feedback: list[str]
) -> FitResult | None:
    llm = get_llm()
    if not llm.available():
        return None
    evidence_lines = "\n".join(
        f"- [{s.type}/{s.strength}] {s.title} ({s.published_at.date().isoformat() if s.published_at else 'undated'}) "
        f"source={s.source} url={s.url or 'n/a'}"
        for s in signals[:8]
    )
    rejected = "\n".join(f"- {reason}" for reason in feedback[:10]) or "- none yet"
    prompt = f"""Qualify this B2B account for outbound. Use ONLY the evidence.

SELLER OFFER: {icp.get('offer') or 'not specified'}
SELLER BUYERS: {', '.join(icp.get('buyers') or []) or 'not specified'}
ROLE KEYWORDS: {', '.join(icp.get('roles') or []) or 'not specified'}
REGION: {icp.get('region') or 'any'}
EXCLUSIONS: {', '.join(icp.get('exclusions') or []) or 'none'}

ACCOUNT: {company} ({domain})
EVIDENCE:
{evidence_lines}

PREVIOUSLY REJECTED (learn from these patterns):
{rejected}

Return JSON with keys:
  fit: boolean (is this a plausible buyer of the offer, right now?)
  confidence: number 0-1
  reason: one sentence citing the specific evidence
  disqualifiers: array of strings (empty when a fit)
  used_evidence: array of the evidence lines you relied on"""
    result = await llm.complete_json(
        "You are a strict B2B qualification analyst. Output only valid JSON. "
        "Never invent facts that are not in the evidence.",
        prompt,
        max_tokens=450,
    )
    if not result or not isinstance(result.get("fit"), bool):
        return None
    confidence = max(0.0, min(1.0, float(result.get("confidence") or 0.0)))
    return FitResult(
        fit=bool(result["fit"]),
        confidence=round(confidence, 2),
        reason=str(result.get("reason") or "")[:500] or "No reason returned by the model.",
        decided=True,
        evidence={
            "used_evidence": result.get("used_evidence") or [],
            "disqualifiers": result.get("disqualifiers") or [],
            "model": llm.name,
        },
        limitations=[] if confidence >= 0.6 else ["Low-confidence model judgement."],
    )


async def qualify(
    icp: dict[str, Any],
    company: str,
    domain: str,
    signals: list[RawSignal],
    feedback: list[str] | None = None,
) -> FitResult:
    llm_result = await llm_fit(icp, company, domain, signals, feedback or [])
    if llm_result is not None:
        return llm_result
    return heuristic_fit(icp, signals)


async def extract_decision_makers(
    icp: dict[str, Any], company: str, signals: list[RawSignal]
) -> list[DecisionMaker]:
    """Find buyer roles. Names are only used when a source actually states them."""
    roles = [r for r in (icp.get("roles") or []) if isinstance(r, str)][:4]
    makers: list[DecisionMaker] = []

    llm = get_llm()
    if llm.available():
        evidence = "\n".join(f"- {s.title} ({s.source})" for s in signals[:5])
        prompt = (
            f"Which decision-maker titles at {company} would own this problem?\n"
            f"Seller buys from roles: {', '.join(roles) or 'not specified'}\nEvidence:\n{evidence}\n"
            'Return JSON {"titles": ["..."], "named_people": [{"name": "...", "title": "..."}]}. '
            "Only include named_people if a piece of evidence names them; never guess a name."
        )
        result = await llm.complete_json("Output only valid JSON.", prompt, max_tokens=250)
        if result:
            for title in (result.get("titles") or [])[:4]:
                if isinstance(title, str) and title.strip():
                    makers.append(DecisionMaker(title=title.strip()[:120], confidence=0.5))
            for person in (result.get("named_people") or [])[:3]:
                name = (person or {}).get("name")
                if isinstance(name, str) and name.strip():
                    makers.append(
                        DecisionMaker(
                            title=str(person.get("title") or "decision maker")[:120],
                            name=name.strip()[:120],
                            confidence=0.55,
                        )
                    )
    if not makers:
        for role in roles or ["founder", "head of operations"]:
            makers.append(DecisionMaker(title=role.title(), confidence=0.3))
    return makers[:5]
