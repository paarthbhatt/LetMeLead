"""Seed a demo tenant with leads, evidence, a campaign and a reply.

Run with: make seed   (idempotent: re-running reuses the demo tenant)
"""

from __future__ import annotations

import os
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

API_DIR = Path(__file__).resolve().parents[1] / "apps" / "api"
sys.path.insert(0, str(API_DIR))

from letmelead import credits, security  # noqa: E402
from letmelead.db import SessionLocal  # noqa: E402
from letmelead.models import (  # noqa: E402
    Campaign,
    Contact,
    Lead,
    LeadSignal,
    Membership,
    Message,
    Reply,
    Sequence,
    SequenceStep,
    Signal,
    Source,
    Target,
    Tenant,
    User,
)
from letmelead.services.pacing import schedule  # noqa: E402
from sqlalchemy import select  # noqa: E402

DEMO_EMAIL = os.getenv("SEED_EMAIL", "demo@letmelead.local")
DEMO_PASSWORD = os.getenv("SEED_PASSWORD", "demo-password-123")

ICP = {
    "offer": "Managed SOC 2 readiness and continuous compliance monitoring for B2B SaaS teams.",
    "buyers": ["CTOs and VP Engineering at Series A-C SaaS", "Security and compliance leads", "COOs scaling operations"],
    "roles": ["security", "compliance", "engineering", "devops", "it", "cto", "ciso"],
    "region": "US and EU",
    "exclusions": ["consultancies", "students"],
}

TARGETS = [
    ("Stripe", "stripe.com", "US"),
    ("Personio", "personio.com", "DE"),
    ("Notion", "notion.so", "US"),
    ("Linear", "linear.app", "US"),
    ("Vercel", "vercel.com", "US"),
    ("Figma", "figma.com", "US"),
    ("Retool", "retool.com", "US"),
    ("Ramp", "ramp.com", "US"),
    ("Deel", "deel.com", "US"),
    ("Miro", "miro.com", "NL"),
    ("Pipedrive", "pipedrive.com", "EE"),
    ("Pitch", "pitch.com", "DE"),
    ("Cal.com", "cal.com", "US"),
    ("Attio", "attio.com", "GB"),
]

# (domain, type, strength, kind, headline, days_ago, url_suffix)
SIGNALS = {
    "stripe.com": [
        ("issue_experienced", "strong", "reddit", "SOC 2 renewal: evidence collection is eating two weeks of every audit cycle", 5, "r/SaaS"),
        ("hiring_signal", "normal", "job_board", "Open role: Security Compliance Program Manager", 12, "jobs"),
    ],
    "personio.com": [
        ("vendor_switch", "strong", "reddit", "Looking to replace our compliance vendor before the next audit — recommendations?", 4, "r/security"),
        ("funding_or_mna", "normal", "news", "Personio acquires Circula to expand spend management", 9, "news"),
    ],
    "notion.so": [
        ("recommendation_request", "strong", "reddit", "Anyone using a managed SOC 2 provider instead of building it in-house?", 3, "r/startups"),
    ],
    "linear.app": [
        ("issue_experienced", "normal", "reddit", "Our audit prep is a spreadsheet nightmare and engineering hates it", 7, "r/ExperiencedDevs"),
        ("hiring_signal", "normal", "job_board", "Open role: Head of Security", 15, "jobs"),
    ],
    "vercel.com": [
        ("vendor_switch", "normal", "reddit", "Switching compliance tooling after a failed Type II audit readiness review", 11, "r/devops"),
    ],
    "figma.com": [
        ("hiring_signal", "normal", "job_board", "Open role: Security Engineer, Trust & Compliance", 6, "jobs"),
    ],
    "retool.com": [
        ("review_complaint", "normal", "reviews", "Support never answered during our security review — 2/5", 20, "g2"),
    ],
    "ramp.com": [
        ("issue_experienced", "normal", "reddit", "SOC 2 evidence gathering is slowing our enterprise deals", 8, "r/fintech"),
    ],
    "deel.com": [
        ("recommendation_request", "normal", "reddit", "Best managed compliance provider for a 200-person remote team?", 14, "r/remotework"),
    ],
    "miro.com": [
        ("leadership_change", "normal", "news", "Miro appoints a new Chief Information Security Officer", 18, "news"),
    ],
    "pipedrive.com": [
        ("hiring_signal", "weak", "job_board", "Open role: IT Operations Analyst", 21, "jobs"),
    ],
    "pitch.com": [
        ("issue_experienced", "weak", "reddit", "Compliance questionnaire for enterprise deals is unmanageable", 26, "r/SaaS"),
    ],
}

SEQUENCE_STEPS = [
    (1, "connect", 0, "Hi — {signal}. We help teams in exactly that spot with {offer}. Worth connecting?"),
    (2, "message", 3, "Thanks for connecting. {signal}. Happy to send the checklist we use for this — no pitch."),
]


def _seed() -> None:
    db = SessionLocal()
    try:
        user = db.scalar(select(User).where(User.email == DEMO_EMAIL))
        if user is None:
            user = User(email=DEMO_EMAIL, name="Demo Owner", password_hash=security.hash_password(DEMO_PASSWORD))
            db.add(user)
            db.flush()

        tenant = db.scalar(select(Tenant).where(Tenant.slug == "demo-workspace"))
        if tenant is None:
            tenant = Tenant(
                name="Northwind Security (demo)",
                slug="demo-workspace",
                website="https://example.com",
                icp=ICP,
                icp_source="seed",
                onboarding_complete=True,
            )
            db.add(tenant)
            db.flush()
        if not db.scalar(select(Membership).where(Membership.tenant_id == tenant.id, Membership.user_id == user.id)):
            db.add(Membership(tenant_id=tenant.id, user_id=user.id, role="owner"))

        for kind, label in (
            ("news", "Company news"),
            ("job_board", "Company job boards"),
            ("reddit", "Reddit discussions"),
        ):
            if not db.scalar(select(Source).where(Source.tenant_id == tenant.id, Source.kind == kind)):
                db.add(Source(tenant_id=tenant.id, kind=kind, name=label, enabled=True, config={"roles": ICP["roles"]}))

        for company, domain, country in TARGETS:
            if not db.scalar(select(Target).where(Target.tenant_id == tenant.id, Target.domain == domain)):
                db.add(Target(tenant_id=tenant.id, company=company, domain=domain, country=country))

        now = datetime.now(UTC)
        for company, domain, _ in TARGETS:
            rows = SIGNALS.get(domain)
            if not rows:
                continue
            if db.scalar(select(Lead).where(Lead.tenant_id == tenant.id, Lead.domain == domain)):
                continue
            lead = Lead(
                tenant_id=tenant.id,
                company=company,
                domain=domain,
                reason="",
                status="new",
                fit="fit",
                fit_confidence=0.78,
                fit_reason="Evidence names audit preparation pressure and an open compliance role.",
                fit_evidence={"used_evidence": [r[3] for r in rows], "disqualifiers": [], "model_judgement": True},
                verification_status="verified",
            )
            db.add(lead)
            db.flush()
            points_total = 0.0
            for signal_type, strength, source, headline, days, suffix in rows:
                published = now - timedelta(days=days)
                url = f"https://example.com/{domain}/{suffix}"
                signal_row = Signal(
                    tenant_id=tenant.id,
                    source=source,
                    type=signal_type,
                    strength=strength,
                    title=headline,
                    url=url,
                    published_at=published,
                    points=2.0,
                    fingerprint=f"seed|{domain}|{signal_type}|{headline[:60]}",
                    detail={"seeded": True},
                )
                db.add(signal_row)
                db.flush()
                db.add(LeadSignal(lead_id=lead.id, signal_id=signal_row.id, points=2.0))
                points_total += 2.0
            lead.reason = " · ".join(
                f"{rows[0][3][:110]} ({rows[0][4]}d ago)" for _ in [0]
            )
            lead.score = round(points_total, 2)
            lead.signal_at = now - timedelta(days=rows[0][4])
            lead.signal_age_days = rows[0][4]
            lead.linkedin_url = f"https://www.linkedin.com/in/{domain.split('.')[0]}-security"
            lead.email = None
            db.add(
                Contact(
                    tenant_id=tenant.id,
                    lead_id=lead.id,
                    title="Head of Security",
                    name=None,
                    linkedin_url=lead.linkedin_url,
                    source="pattern",
                    confidence=0.35,
                    verified=False,
                )
            )

        # Demo campaign with one reply, so the inbox is not empty.
        campaign = db.scalar(select(Campaign).where(Campaign.tenant_id == tenant.id, Campaign.name == "Q4 SOC 2 push"))
        if campaign is None:
            campaign = Campaign(
                tenant_id=tenant.id,
                name="Q4 SOC 2 push",
                status="active",
                ramp_started_at=now - timedelta(days=6),
                created_by=user.id,
            )
            db.add(campaign)
            db.flush()
            sequence = Sequence(campaign_id=campaign.id, name="Signal-led sequence")
            db.add(sequence)
            db.flush()
            for step_no, kind, delay, body in SEQUENCE_STEPS:
                db.add(
                    SequenceStep(
                        sequence_id=sequence.id, step_no=step_no, kind=kind, body_template=body, delay_days=delay
                    )
                )
            leads = db.scalars(select(Lead).where(Lead.tenant_id == tenant.id).limit(4)).all()
            slots = schedule(len(leads))
            for lead, slot in zip(leads, slots, strict=False):
                db.add(
                    Message(
                        tenant_id=tenant.id,
                        campaign_id=campaign.id,
                        lead_id=lead.id,
                        step_no=1,
                        body=f"Hi — {lead.reason[:120]}. We help with managed SOC 2 readiness. Worth connecting?",
                        status="queued",
                        scheduled_at=slot,
                        meta={"kind": "connect", "personalized": True},
                    )
                )
            if leads:
                db.add(
                    Reply(
                        tenant_id=tenant.id,
                        campaign_id=campaign.id,
                        lead_id=leads[0].id,
                        body="Interesting — we are re-evaluating providers this quarter. Can you share how onboarding works?",
                        received_at=now - timedelta(hours=5),
                    )
                )
                leads[0].status = "replied"

        # Demo credits: the first ten lead claims are free; make the ledger show one pack purchase.
        if credits.balance(db, tenant.id) == 0:
            credits.append(db, tenant.id, 100, "top-up: 100 credits (seed demo)", ref_type="order")
        for i, lead in enumerate(db.scalars(select(Lead).where(Lead.tenant_id == tenant.id).limit(6)).all()):
            if lead.status == "new" and i < 3:
                lead.status = "claimed"
                lead.claimed_at = now - timedelta(days=2)
                lead.claimed_by = user.id
                credits.append(
                    db, tenant.id, 0, f"free lead {i + 1}/10", ref_type="lead", ref_id=lead.id,
                    idempotency_key=f"claim:{lead.id}",
                )

        db.commit()
        print(f"seeded tenant={tenant.slug} user={DEMO_EMAIL} password={DEMO_PASSWORD}")
    finally:
        db.close()


if __name__ == "__main__":
    _seed()
