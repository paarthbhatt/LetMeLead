"""Credits, ledger, Stripe top-ups and invoices.

There is no subscription logic. Credits are bought in packs, never expire, and every
movement is an append-only ledger row with a visible reason.
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime

import sqlalchemy as sa
from fastapi import APIRouter, Header, Request
from sqlalchemy.orm import Session

from .. import audit, credits
from ..config import settings
from ..deps import ActorDep, DbSession, IdempotencyDep, WriterDep, apply_cursor, page
from ..errors import ApiError
from ..models import Invoice, Order
from ..schemas import (
    BalanceOut,
    InvoiceOut,
    LedgerEntryOut,
    OrderOut,
    Page,
    TopUpRequest,
)

logger = logging.getLogger("letmelead.billing")
router = APIRouter(tags=["billing"])


def spend_report(db: Session, tenant_id: uuid.UUID) -> dict:
    rows = db.execute(
        sa.select(credits.CreditsLedger.reason, sa.func.sum(-credits.CreditsLedger.delta))
        .where(credits.CreditsLedger.tenant_id == tenant_id, credits.CreditsLedger.delta < 0)
        .group_by(credits.CreditsLedger.reason)
    ).all()
    spent = sum(int(total or 0) for _, total in rows)
    topped_up = db.scalar(
        sa.select(sa.func.coalesce(sa.func.sum(credits.CreditsLedger.delta), 0)).where(
            credits.CreditsLedger.tenant_id == tenant_id, credits.CreditsLedger.delta > 0
        )
    )
    return {"credits_spent": spent, "credits_purchased": int(topped_up or 0)}


@router.get("/credits", response_model=BalanceOut)
def get_credits(actor: ActorDep, db: DbSession):
    used = credits.free_leads_used(db, actor.tenant_id)
    return BalanceOut(
        balance=credits.balance(db, actor.tenant_id),
        free_leads_used=used,
        free_leads_remaining=max(settings.free_leads_per_tenant - used, 0),
        lead_price_credits=settings.lead_price_credits,
        spend_report=spend_report(db, actor.tenant_id),
    )


@router.get("/credits/ledger", response_model=Page[LedgerEntryOut])
def ledger(actor: ActorDep, db: DbSession, limit: int = 50, cursor: str | None = None):
    stmt = sa.select(credits.CreditsLedger).where(credits.CreditsLedger.tenant_id == actor.tenant_id)
    rows = list(db.scalars(apply_cursor(stmt, credits.CreditsLedger, cursor, min(limit, 200))).all())
    items, next_cursor = page(rows, min(limit, 200), credits.CreditsLedger)
    return Page(items=[LedgerEntryOut.model_validate(r) for r in items], next_cursor=next_cursor)


def _stripe():
    if not settings.stripe_secret_key:
        return None
    import stripe

    stripe.api_key = settings.stripe_secret_key
    return stripe


@router.post("/orders/top-up", response_model=OrderOut)
def top_up(payload: TopUpRequest, actor: WriterDep, db: DbSession, idem: IdempotencyDep):
    if idem.replay is not None:
        return idem.replay
    total_credits = settings.credits_per_pack * payload.pack
    amount = settings.credits_pack_price_cents * payload.pack
    order = Order(
        tenant_id=actor.tenant_id,
        provider="stripe",
        credits=total_credits,
        amount_cents=amount,
        currency="usd",
        status="pending",
        created_by=actor.user.id if actor.user else None,
    )
    db.add(order)
    db.flush()

    stripe = _stripe()
    if stripe is None:
        audit.record(db, actor.tenant_id, "order.created", actor.actor_type, actor.actor_id, "order", order.id,
                     meta={"credits": total_credits, "stripe": False})
        db.commit()
        body = OrderOut.model_validate(order).model_dump(mode="json")
        idem.store(body, 201)
        return OrderOut.model_validate(order)

    session = stripe.checkout.Session.create(
        mode="payment",
        line_items=[
            {
                "quantity": 1,
                "price_data": {
                    "currency": "usd",
                    "unit_amount": amount,
                    "product_data": {"name": f"{total_credits} LetMeLead credits"},
                },
            }
        ],
        success_url=f"{settings.web_base_url}/credits?status=success&order={order.id}",
        cancel_url=f"{settings.web_base_url}/credits?status=cancelled&order={order.id}",
        client_reference_id=str(order.id),
        metadata={"tenant_id": str(actor.tenant_id), "order_id": str(order.id), "credits": total_credits},
    )
    order.provider_id = session.get("id")
    order.checkout_url = session.get("url")
    audit.record(db, actor.tenant_id, "order.created", actor.actor_type, actor.actor_id, "order", order.id,
                 meta={"credits": total_credits, "stripe": True})
    db.commit()
    body = OrderOut.model_validate(order).model_dump(mode="json")
    idem.store(body, 201)
    return OrderOut.model_validate(order)


@router.get("/orders", response_model=list[OrderOut])
def list_orders(actor: ActorDep, db: DbSession):
    return db.scalars(
        sa.select(Order).where(Order.tenant_id == actor.tenant_id).order_by(Order.created_at.desc()).limit(100)
    ).all()


@router.get("/invoices", response_model=list[InvoiceOut])
def list_invoices(actor: ActorDep, db: DbSession):
    return db.scalars(
        sa.select(Invoice).where(Invoice.tenant_id == actor.tenant_id).order_by(Invoice.issued_at.desc()).limit(100)
    ).all()


def _fulfil(db: Session, order: Order) -> bool:
    """Mark an order paid exactly once and grant its credits."""
    if order.status == "paid":
        return False
    order.status = "paid"
    order.paid_at = datetime.now(UTC)
    credits.grant_pack(db, order.tenant_id, order.id, order.credits)
    number = f"LML-{order.created_at.strftime('%Y%m')}-{str(order.id)[:8].upper()}"
    db.add(
        Invoice(
            tenant_id=order.tenant_id,
            order_id=order.id,
            number=number,
            amount_cents=order.amount_cents,
            url=None,
        )
    )
    audit.record(db, order.tenant_id, "order.paid", actor_type="system", target_type="order", target_id=order.id,
                 meta={"credits": order.credits, "amount_cents": order.amount_cents})
    return True


@router.post("/webhooks/stripe")
async def stripe_webhook(
    request: Request,
    db: DbSession,
    stripe_signature: str | None = Header(default=None, alias="Stripe-Signature"),
):
    stripe = _stripe()
    if stripe is None:
        raise ApiError("stripe_not_configured", "Stripe is not configured.", status_code=501)
    payload = await request.body()
    if settings.stripe_webhook_secret:
        try:
            event = stripe.Webhook.construct_event(payload, stripe_signature or "", settings.stripe_webhook_secret)
        except Exception as exc:  # signature failures must be 400, not 500
            raise ApiError("invalid_signature", "Stripe signature verification failed.", status_code=400) from exc
    else:
        event = await request.json()
        logger.warning("stripe_webhook_without_secret")

    event_type = event.get("type") if isinstance(event, dict) else event["type"]
    data = (event.get("data") if isinstance(event, dict) else event["data"])["object"]
    if event_type not in {"checkout.session.completed", "payment_intent.succeeded"}:
        return {"received": True, "ignored": event_type}

    order_id = (data.get("client_reference_id") or data.get("metadata", {}).get("order_id"))
    if not order_id:
        raise ApiError("missing_order", "Event has no order reference.", status_code=422)
    order = db.get(Order, uuid.UUID(str(order_id)))
    if not order:
        raise ApiError("not_found", "Order not found.", status_code=404)
    changed = _fulfil(db, order)
    db.commit()
    return {"received": True, "fulfilled": changed, "order_id": str(order.id)}
