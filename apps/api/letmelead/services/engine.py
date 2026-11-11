"""The signal engine: collect -> normalise -> dedupe -> score -> qualify -> persist."""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

import httpx
import sqlalchemy as sa
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import audit
from ..config import settings
from ..models import Contact, Enrichment, Lead, LeadSignal, Signal, Source, Target, Tenant
from .adapters import ADAPTERS, RawSignal, SourceBlocked, SourceUnavailable, TargetRef
from .enrichment import get_enrichment
from .qualification import extract_decision_makers, qualify
from .scoring import collapse_duplicates, points_for, score_domain
from .webhooks_out import enqueue

logger = logging.getLogger("letmelead.engine")


@dataclass
class SourceReport:
    kind: str
    ok: bool
    collected: int = 0
    error: str | None = None


@dataclass
class ScanReport:
    sources: list[SourceReport] = field(default_factory=list)
    signals_new: int = 0
    domains: int = 0
    leads_created: int = 0
    leads_updated: int = 0
    rejected: int = 0
    started_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    finished_at: datetime | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "sources": [s.__dict__ for s in self.sources],
            "signals_new": self.signals_new,
            "domains": self.domains,
            "leads_created": self.leads_created,
            "leads_updated": self.leads_updated,
            "rejected": self.rejected,
            "started_at": self.started_at.isoformat(),
            "finished_at": (self.finished_at or datetime.now(UTC)).isoformat(),
        }


async def _verify(url: str | None) -> str:
    """A signal is only 'verified' when its URL answers at collection time."""
    if not url:
        return "unverified"
    try:
        async with httpx.AsyncClient(timeout=6, follow_redirects=True, headers={"User-Agent": "LetMeLead/1.0"}) as c:
            res = await c.head(url)
        return "verified" if res.status_code < 400 else "unverified"
    except httpx.HTTPError:
        return "unverified"


def _feedback_reasons(db: Session, tenant_id: uuid.UUID) -> list[str]:
    rows = db.scalars(
        sa.select(Lead.fit_reason)
        .where(Lead.tenant_id == tenant_id, Lead.fit == "not_fit", Lead.fit_reason.is_not(None))
        .order_by(Lead.updated_at.desc())
        .limit(15)
    ).all()
    return [r for r in rows if r]


def _upsert_signal(db: Session, tenant_id: uuid.UUID, target_id: uuid.UUID | None, raw: RawSignal) -> bool:
    fp = raw.fingerprint(tenant_id)
    exists = db.scalar(sa.select(Signal.id).where(Signal.tenant_id == tenant_id, Signal.fingerprint == fp))
    if exists:
        return False
    scored = points_for(raw)
    db.add(
        Signal(
            tenant_id=tenant_id,
            target_id=target_id,
            source=raw.source,
            type=raw.type,
            strength=raw.strength,
            title=raw.title,
            url=raw.url,
            published_at=raw.published_at,
            points=scored.points,
            fingerprint=fp,
            detail=raw.detail,
        )
    )
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        return False
    return True


async def run_scan(
    db: Session,
    tenant: Tenant,
    source_kinds: list[str] | None = None,
    target_limit: int = 50,
) -> ScanReport:
    report = ScanReport()
    sources = db.scalars(
        sa.select(Source).where(Source.tenant_id == tenant.id, Source.enabled.is_(True))
    ).all()
    if source_kinds:
        sources = [s for s in sources if s.kind in source_kinds]
    targets = db.scalars(
        sa.select(Target).where(Target.tenant_id == tenant.id, Target.active.is_(True)).limit(200)
    ).all()
    if not targets:
        report.finished_at = datetime.now(UTC)
        return report

    refs = [
        TargetRef(
            company=t.company,
            domain=t.domain,
            country=t.country,
            employer=t.employer,
            news_query=t.news_query,
            careers_url=t.careers_url,
        )
        for t in targets[:target_limit]
    ]
    target_by_domain = {t.domain: t for t in targets}
    icp = tenant.icp or {}
    adapter_config = {"roles": icp.get("roles") or [], "lookback_days": settings.signal_max_age_days}

    collected: list[RawSignal] = []
    for source in sources:
        adapter = ADAPTERS.get(source.kind)
        if not adapter:
            report.sources.append(SourceReport(kind=source.kind, ok=False, error="unknown adapter"))
            continue
        try:
            if not adapter.available():
                raise SourceUnavailable(f"{adapter.requires} is not configured")
            raw = await adapter.fetch(refs, {**adapter_config, **(source.config or {})})
            source.last_run_at = datetime.now(UTC)
            source.last_status = "ok"
            source.last_error = None
            report.sources.append(SourceReport(kind=source.kind, ok=True, collected=len(raw)))
            collected.extend(raw)
        except (SourceUnavailable, SourceBlocked) as exc:
            source.last_status = "blocked" if isinstance(exc, SourceBlocked) else "unconfigured"
            source.last_error = str(exc)[:500]
            report.sources.append(SourceReport(kind=source.kind, ok=False, error=str(exc)[:300]))
        except Exception as exc:  # one adapter must never kill the run
            logger.exception("adapter_failed", extra={"source": source.kind})
            source.last_status = "error"
            source.last_error = str(exc)[:500]
            report.sources.append(SourceReport(kind=source.kind, ok=False, error=str(exc)[:300]))

    if not collected:
        db.commit()
        report.finished_at = datetime.now(UTC)
        return report

    unique = collapse_duplicates(collected)
    new_signals: list[tuple[RawSignal, str]] = []
    for raw in unique:
        target = target_by_domain.get(raw.domain)
        if _upsert_signal(db, tenant.id, target.id if target else None, raw):
            new_signals.append((raw, raw.domain))
    report.signals_new = len(new_signals)
    db.commit()

    by_domain: dict[str, list[RawSignal]] = {}
    for raw, domain in new_signals:
        by_domain.setdefault(domain, []).append(raw)
    report.domains = len(by_domain)

    feedback = _feedback_reasons(db, tenant.id)
    enrichment = get_enrichment()

    for domain, raws in by_domain.items():
        company = raws[0].company
        scored = [points_for(r) for r in raws]
        domain_score = score_domain(company, domain, scored)
        if not domain_score.top or domain_score.score <= 0:
            continue

        fit = await qualify(icp, company, domain, raws, feedback)
        if fit.decided and not fit.fit and fit.confidence >= 0.6:
            report.rejected += 1
            continue

        makers = await extract_decision_makers(icp, company, raws)
        enriched = await enrichment.enrich(company=company, domain=domain, decision_makers=makers)
        top = domain_score.top
        age_days = top.age_days
        verification = await _verify(top.signal.url)

        lead = db.scalar(
            sa.select(Lead).where(Lead.tenant_id == tenant.id, Lead.domain == domain)
        )
        created = lead is None
        if lead is None:
            lead = Lead(
                tenant_id=tenant.id,
                company=company,
                domain=domain,
                reason=domain_score.reason,
                status="new",
                fit="unknown",
                score=0,
            )
            db.add(lead)
        if created or domain_score.score >= (lead.score or 0):
            lead.company = company
            lead.reason = domain_score.reason
            lead.signal_at = top.signal.published_at
            lead.signal_age_days = age_days
            lead.score = domain_score.score
            lead.fit = "fit" if fit.fit else ("not_fit" if fit.decided else "unknown")
            lead.fit_confidence = fit.confidence
            lead.fit_reason = fit.reason
            lead.fit_evidence = {
                **fit.evidence,
                "limitations": fit.limitations,
                "model_judgement": fit.decided,
            }
            lead.verification_status = verification
            if enriched.contacts:
                primary = enriched.contacts[0]
                lead.linkedin_url = lead.linkedin_url or primary.linkedin_url
                lead.email = lead.email or primary.email
                lead.phone = lead.phone or primary.phone
        db.flush()

        # refresh evidence list
        db.execute(sa.delete(LeadSignal).where(LeadSignal.lead_id == lead.id))
        stored = db.scalars(
            sa.select(Signal).where(
                Signal.tenant_id == tenant.id,
                Signal.fingerprint.in_([r.fingerprint(tenant.id) for r in raws]),
            )
        ).all()
        for signal_row in stored:
            db.add(LeadSignal(lead_id=lead.id, signal_id=signal_row.id, points=signal_row.points))
        lead.source_signal_id = stored[0].id if stored else None

        db.execute(sa.delete(Contact).where(Contact.lead_id == lead.id))
        for contact in enriched.contacts:
            db.add(
                Contact(
                    tenant_id=tenant.id,
                    lead_id=lead.id,
                    name=contact.name,
                    title=contact.title,
                    linkedin_url=contact.linkedin_url,
                    email=contact.email,
                    phone=contact.phone,
                    source=enrichment.name,
                    confidence=contact.confidence,
                    verified=contact.verified,
                )
            )
            db.add(
                Enrichment(
                    tenant_id=tenant.id,
                    lead_id=lead.id,
                    provider=enrichment.name,
                    kind="email" if contact.email else "profile",
                    status="ok",
                    payload={"title": contact.title, "has_email": bool(contact.email)},
                    limitation="; ".join(enriched.limitations) or None,
                )
            )

        if created:
            report.leads_created += 1
            enqueue(
                db,
                tenant.id,
                "lead.created",
                {
                    "lead_id": str(lead.id),
                    "company": company,
                    "domain": domain,
                    "reason": lead.reason,
                    "score": lead.score,
                    "signal_age_days": lead.signal_age_days,
                },
            )
        else:
            report.leads_updated += 1

    audit.record(
        db,
        tenant.id,
        "scan.completed",
        actor_type="system",
        meta={
            "signals_new": report.signals_new,
            "leads_created": report.leads_created,
            "leads_updated": report.leads_updated,
            "sources": [s.kind for s in report.sources if s.ok],
        },
    )
    db.commit()
    report.finished_at = datetime.now(UTC)
    return report
