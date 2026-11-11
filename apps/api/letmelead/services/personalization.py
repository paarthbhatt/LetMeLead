"""Per-lead message writing.

Templates carry facts from the lead's own evidence; the LLM path must return a
message that names the signal. Nothing here uses merge-tag blasting: every message is
generated from that lead's reason line and contact title.
"""

from __future__ import annotations

import logging

from ..models import Contact, Lead, SequenceStep, Tenant
from .llm import get_llm

logger = logging.getLogger("letmelead.personalization")

MAX_LEN = {"connect": 280, "message": 700}


def _fallback(tenant: Tenant, lead: Lead, step: SequenceStep, contact: Contact | None) -> str:
    offer = (tenant.icp or {}).get("offer") or "what we do"
    signal = lead.reason.split(" · ")[0]
    title = contact.title if contact and contact.title else "your team"
    if step.kind == "connect":
        return f"Hi — {signal[:170]}. I work with {title}s on {offer[:80]}. Open to connecting?"[:MAX_LEN["connect"]]
    return (
        f"Thanks for connecting. I noticed {signal[:200]}.\n\n"
        f"We help teams in exactly that spot with {offer[:150]}. "
        "If it is useful I can send a short example — no pitch."
    )[: MAX_LEN["message"]]


def render_template(template: str, tenant: Tenant, lead: Lead, contact: Contact | None) -> str:
    """Expand the few supported placeholders. Unknown braces are left untouched."""
    values = {
        "company": lead.company,
        "reason": lead.reason,
        "signal": lead.reason.split(" · ")[0],
        "offer": (tenant.icp or {}).get("offer") or "",
        "title": (contact.title if contact else "") or "",
        "name": (contact.name if contact else "") or "",
        "first_name": ((contact.name or "").split(" ")[0] if contact else ""),
    }
    out = template
    for key, value in values.items():
        out = out.replace("{" + key + "}", str(value))
    return out


async def personalize(tenant: Tenant, lead: Lead, step: SequenceStep, contact: Contact | None) -> str:
    if "{" in step.body_template:
        return render_template(step.body_template, tenant, lead, contact)

    llm = get_llm()
    if not llm.available():
        return _fallback(tenant, lead, step, contact)

    offer = (tenant.icp or {}).get("offer") or "not specified"
    prompt = f"""Write one LinkedIn {step.kind} message.

RECIPIENT: {contact.name if contact and contact.name else "a decision maker"} — {contact.title if contact else "unknown title"}
COMPANY: {lead.company}
WHY NOW (use this exact evidence, do not embellish): {lead.reason}
WHAT WE SELL: {offer}

Rules:
- 1-3 short sentences; connection notes max {MAX_LEN['connect']} characters.
- Name the signal plainly. No fake familiarity, no claims the evidence does not support.
- No links, no emojis, no "I hope this finds you well".
- Do not promise results. Sign as the sender.
Return JSON {{"message": "..."}}"""
    result = await llm.complete_json("You write concise, honest B2B outreach. Output only JSON.", prompt, max_tokens=250)
    message = (result or {}).get("message")
    if not isinstance(message, str) or len(message.strip()) < 20:
        return _fallback(tenant, lead, step, contact)
    return message.strip()[: MAX_LEN[step.kind]]
