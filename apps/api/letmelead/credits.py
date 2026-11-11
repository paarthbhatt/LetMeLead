"""Append-only credits ledger.

Invariants (covered by tests):
  * rows are only ever inserted; no UPDATE or DELETE path exists in the app;
  * `balance_after` always equals the running sum for that tenant;
  * an idempotency key can be used at most once per tenant.
"""

from __future__ import annotations

import uuid

import sqlalchemy as sa
from sqlalchemy.orm import Session

from .config import settings
from .errors import ApiError
from .models import CreditsLedger

FREE_REASON_PREFIX = "free lead "


def balance(db: Session, tenant_id: uuid.UUID) -> int:
    total = db.scalar(sa.select(sa.func.coalesce(sa.func.sum(CreditsLedger.delta), 0)).where(
        CreditsLedger.tenant_id == tenant_id
    ))
    return int(total or 0)


def free_leads_used(db: Session, tenant_id: uuid.UUID) -> int:
    count = db.scalar(
        sa.select(sa.func.count()).select_from(CreditsLedger).where(
            CreditsLedger.tenant_id == tenant_id,
            CreditsLedger.reason.like(f"{FREE_REASON_PREFIX}%"),
        )
    )
    return int(count or 0)


def append(
    db: Session,
    tenant_id: uuid.UUID,
    delta: int,
    reason: str,
    ref_type: str | None = None,
    ref_id: uuid.UUID | None = None,
    idempotency_key: str | None = None,
) -> CreditsLedger:
    if idempotency_key:
        existing = db.scalar(
            sa.select(CreditsLedger).where(
                CreditsLedger.tenant_id == tenant_id,
                CreditsLedger.idempotency_key == idempotency_key,
            )
        )
        if existing:
            return existing

    current = balance(db, tenant_id)
    next_balance = current + delta
    if next_balance < 0:
        raise ApiError(
            "insufficient_credits",
            f"This action needs {-delta} credit(s) and the balance is {current}.",
            status_code=402,
            details={"balance": current, "required": -delta},
        )

    entry = CreditsLedger(
        tenant_id=tenant_id,
        delta=delta,
        reason=reason,
        ref_type=ref_type,
        ref_id=ref_id,
        balance_after=next_balance,
        idempotency_key=idempotency_key,
    )
    db.add(entry)
    db.flush()
    return entry


def claim_charge(db: Session, tenant_id: uuid.UUID, lead_id: uuid.UUID, lead_label: str) -> tuple[int, bool]:
    """Charge for one lead. Returns (credits_charged, was_free)."""
    used = free_leads_used(db, tenant_id)
    if used < settings.free_leads_per_tenant:
        append(
            db,
            tenant_id,
            delta=0,
            reason=f"{FREE_REASON_PREFIX}{used + 1}/{settings.free_leads_per_tenant}",
            ref_type="lead",
            ref_id=lead_id,
            idempotency_key=f"claim:{lead_id}",
        )
        return 0, True

    price = settings.lead_price_credits
    append(
        db,
        tenant_id,
        delta=-price,
        reason=f"claimed lead: {lead_label}",
        ref_type="lead",
        ref_id=lead_id,
        idempotency_key=f"claim:{lead_id}",
    )
    return price, False


def grant_pack(db: Session, tenant_id: uuid.UUID, order_id: uuid.UUID, credits: int) -> CreditsLedger:
    """Idempotent top-up credit grant keyed on the order."""
    return append(
        db,
        tenant_id,
        delta=credits,
        reason=f"top-up: {credits} credits",
        ref_type="order",
        ref_id=order_id,
        idempotency_key=f"order:{order_id}",
    )


def ledger_page(db: Session, tenant_id: uuid.UUID, limit: int, before_id: uuid.UUID | None = None):
    stmt = sa.select(CreditsLedger).where(CreditsLedger.tenant_id == tenant_id)
    stmt = stmt.order_by(CreditsLedger.created_at.desc(), CreditsLedger.id.desc()).limit(limit)
    return list(db.scalars(stmt))
