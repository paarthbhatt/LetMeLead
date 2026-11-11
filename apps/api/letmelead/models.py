"""SQLAlchemy models for the multi-tenant lead engine.

Tenant isolation is enforced in the data model itself: every business table carries
`tenant_id` and every query in the API filters on it (see deps.tenant_scope).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    return datetime.now(UTC)


def new_uuid() -> uuid.UUID:
    return uuid.uuid4()


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )


class Tenant(Base, TimestampMixin):
    __tablename__ = "tenants"

    id: Mapped[uuid.UUID] = mapped_column(sa.Uuid, primary_key=True, default=new_uuid)
    name: Mapped[str] = mapped_column(sa.String(160), nullable=False)
    slug: Mapped[str] = mapped_column(sa.String(80), unique=True, nullable=False)
    website: Mapped[str | None] = mapped_column(sa.String(300))
    # ICP brief: {"offer", "buyers": [...], "roles": [...], "region", "exclusions": [...]}
    icp: Mapped[dict] = mapped_column(sa.JSON, default=dict, nullable=False)
    icp_source: Mapped[str | None] = mapped_column(sa.String(32))
    onboarding_complete: Mapped[bool] = mapped_column(sa.Boolean, default=False, nullable=False)

    memberships: Mapped[list[Membership]] = relationship(back_populates="tenant", cascade="all, delete-orphan")


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(sa.Uuid, primary_key=True, default=new_uuid)
    email: Mapped[str] = mapped_column(sa.String(320), unique=True, nullable=False, index=True)
    name: Mapped[str | None] = mapped_column(sa.String(160))
    password_hash: Mapped[str | None] = mapped_column(sa.String(255))
    google_sub: Mapped[str | None] = mapped_column(sa.String(120), unique=True)
    is_active: Mapped[bool] = mapped_column(sa.Boolean, default=True, nullable=False)


class Membership(Base, TimestampMixin):
    __tablename__ = "memberships"
    __table_args__ = (sa.UniqueConstraint("tenant_id", "user_id", name="uq_membership_tenant_user"),)

    id: Mapped[uuid.UUID] = mapped_column(sa.Uuid, primary_key=True, default=new_uuid)
    tenant_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(sa.String(16), default="member", nullable=False)  # owner|member|viewer

    tenant: Mapped[Tenant] = relationship(back_populates="memberships")
    user: Mapped[User] = relationship()


class TenantSignal(Base):
    """A tenant's on/off choice for one signal from the static catalog.

    Rows exist only for signals the tenant has explicitly toggled; absent rows
    mean "catalog default" (see signals_catalog.SignalDef.enabled_by_default).
    """

    __tablename__ = "tenant_signals"
    __table_args__ = (sa.CheckConstraint("signal_id <> ''", name="ck_tenant_signal_id"),)

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("tenants.id", ondelete="CASCADE"), primary_key=True
    )
    signal_id: Mapped[str] = mapped_column(sa.String(64), primary_key=True)
    enabled: Mapped[bool] = mapped_column(sa.Boolean, default=True, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )


class ApiKey(Base, TimestampMixin):
    __tablename__ = "api_keys"

    id: Mapped[uuid.UUID] = mapped_column(sa.Uuid, primary_key=True, default=new_uuid)
    tenant_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(sa.String(120), nullable=False)
    prefix: Mapped[str] = mapped_column(sa.String(16), nullable=False, index=True)
    key_hash: Mapped[str] = mapped_column(sa.String(128), nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(sa.ForeignKey("users.id", ondelete="SET NULL"))
    last_used_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))


class Source(Base, TimestampMixin):
    """A configured source adapter for a tenant (also the watchlist record)."""

    __tablename__ = "sources"
    __table_args__ = (sa.UniqueConstraint("tenant_id", "kind", name="uq_source_tenant_kind"),)

    id: Mapped[uuid.UUID] = mapped_column(sa.Uuid, primary_key=True, default=new_uuid)
    tenant_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(sa.String(32), nullable=False)
    name: Mapped[str] = mapped_column(sa.String(120), nullable=False)
    enabled: Mapped[bool] = mapped_column(sa.Boolean, default=True, nullable=False)
    config: Mapped[dict] = mapped_column(sa.JSON, default=dict, nullable=False)
    daily_quota: Mapped[int] = mapped_column(sa.Integer, default=200, nullable=False)
    last_run_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    last_status: Mapped[str | None] = mapped_column(sa.String(24))
    last_error: Mapped[str | None] = mapped_column(sa.Text)


class Target(Base, TimestampMixin):
    __tablename__ = "targets"
    __table_args__ = (sa.UniqueConstraint("tenant_id", "domain", name="uq_target_tenant_domain"),)

    id: Mapped[uuid.UUID] = mapped_column(sa.Uuid, primary_key=True, default=new_uuid)
    tenant_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    company: Mapped[str] = mapped_column(sa.String(200), nullable=False)
    domain: Mapped[str] = mapped_column(sa.String(253), nullable=False)
    country: Mapped[str | None] = mapped_column(sa.String(2))
    employer: Mapped[str | None] = mapped_column(sa.String(200))
    news_query: Mapped[str | None] = mapped_column(sa.String(300))
    careers_url: Mapped[str | None] = mapped_column(sa.String(400))
    active: Mapped[bool] = mapped_column(sa.Boolean, default=True, nullable=False)


class Signal(Base, TimestampMixin):
    __tablename__ = "signals"
    __table_args__ = (
        sa.UniqueConstraint("tenant_id", "fingerprint", name="uq_signal_tenant_fingerprint"),
        sa.Index("ix_signal_tenant_published", "tenant_id", "published_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(sa.Uuid, primary_key=True, default=new_uuid)
    tenant_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    target_id: Mapped[uuid.UUID | None] = mapped_column(sa.ForeignKey("targets.id", ondelete="SET NULL"))
    source: Mapped[str] = mapped_column(sa.String(32), nullable=False)
    type: Mapped[str] = mapped_column(sa.String(40), nullable=False)
    strength: Mapped[str] = mapped_column(sa.String(10), default="normal", nullable=False)
    title: Mapped[str] = mapped_column(sa.Text, nullable=False)
    url: Mapped[str | None] = mapped_column(sa.Text)
    published_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    points: Mapped[float] = mapped_column(sa.Float, default=0.0, nullable=False)
    # sha1 of tenant|domain|type|url|title so repeat runs never duplicate a signal
    fingerprint: Mapped[str] = mapped_column(sa.String(80), nullable=False)
    detail: Mapped[dict] = mapped_column(sa.JSON, default=dict, nullable=False)


class Lead(Base, TimestampMixin):
    __tablename__ = "leads"
    __table_args__ = (
        sa.UniqueConstraint("tenant_id", "linkedin_url", name="uq_lead_tenant_linkedin"),
        sa.UniqueConstraint("tenant_id", "email", name="uq_lead_tenant_email"),
        sa.UniqueConstraint("tenant_id", "domain", name="uq_lead_tenant_domain"),
        sa.Index("ix_lead_tenant_status", "tenant_id", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(sa.Uuid, primary_key=True, default=new_uuid)
    tenant_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    company: Mapped[str] = mapped_column(sa.String(200), nullable=False)
    domain: Mapped[str] = mapped_column(sa.String(253), nullable=False)
    reason: Mapped[str] = mapped_column(sa.Text, nullable=False)  # plain language, dated
    signal_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    signal_age_days: Mapped[int | None] = mapped_column(sa.Integer)
    score: Mapped[float] = mapped_column(sa.Float, default=0.0, nullable=False)
    fit: Mapped[str] = mapped_column(sa.String(12), default="unknown", nullable=False)  # fit|not_fit|unknown
    fit_confidence: Mapped[float] = mapped_column(sa.Float, default=0.0, nullable=False)
    fit_reason: Mapped[str | None] = mapped_column(sa.Text)
    fit_evidence: Mapped[dict] = mapped_column(sa.JSON, default=dict, nullable=False)
    verification_status: Mapped[str] = mapped_column(sa.String(16), default="unverified", nullable=False)
    status: Mapped[str] = mapped_column(sa.String(16), default="new", nullable=False)
    linkedin_url: Mapped[str | None] = mapped_column(sa.Text)
    email: Mapped[str | None] = mapped_column(sa.String(320))
    phone: Mapped[str | None] = mapped_column(sa.String(40))
    claimed_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    claimed_by: Mapped[uuid.UUID | None] = mapped_column(sa.ForeignKey("users.id", ondelete="SET NULL"))
    source_signal_id: Mapped[uuid.UUID | None] = mapped_column(sa.ForeignKey("signals.id", ondelete="SET NULL"))

    signals: Mapped[list[LeadSignal]] = relationship(back_populates="lead", cascade="all, delete-orphan")
    contacts: Mapped[list[Contact]] = relationship(back_populates="lead", cascade="all, delete-orphan")


class LeadSignal(Base):
    __tablename__ = "lead_signals"
    __table_args__ = (sa.UniqueConstraint("lead_id", "signal_id", name="uq_lead_signal"),)

    id: Mapped[uuid.UUID] = mapped_column(sa.Uuid, primary_key=True, default=new_uuid)
    lead_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("leads.id", ondelete="CASCADE"), index=True)
    signal_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("signals.id", ondelete="CASCADE"))
    points: Mapped[float] = mapped_column(sa.Float, default=0.0, nullable=False)

    lead: Mapped[Lead] = relationship(back_populates="signals")
    signal: Mapped[Signal] = relationship()


class Contact(Base, TimestampMixin):
    __tablename__ = "contacts"

    id: Mapped[uuid.UUID] = mapped_column(sa.Uuid, primary_key=True, default=new_uuid)
    tenant_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    lead_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("leads.id", ondelete="CASCADE"), index=True)
    name: Mapped[str | None] = mapped_column(sa.String(200))
    title: Mapped[str | None] = mapped_column(sa.String(200))
    linkedin_url: Mapped[str | None] = mapped_column(sa.Text)
    email: Mapped[str | None] = mapped_column(sa.String(320))
    phone: Mapped[str | None] = mapped_column(sa.String(40))
    source: Mapped[str | None] = mapped_column(sa.String(40))
    confidence: Mapped[float] = mapped_column(sa.Float, default=0.0, nullable=False)
    verified: Mapped[bool] = mapped_column(sa.Boolean, default=False, nullable=False)

    lead: Mapped[Lead] = relationship(back_populates="contacts")


class Enrichment(Base, TimestampMixin):
    __tablename__ = "enrichments"

    id: Mapped[uuid.UUID] = mapped_column(sa.Uuid, primary_key=True, default=new_uuid)
    tenant_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    contact_id: Mapped[uuid.UUID | None] = mapped_column(sa.ForeignKey("contacts.id", ondelete="CASCADE"))
    lead_id: Mapped[uuid.UUID | None] = mapped_column(sa.ForeignKey("leads.id", ondelete="CASCADE"))
    provider: Mapped[str] = mapped_column(sa.String(40), nullable=False)
    kind: Mapped[str] = mapped_column(sa.String(24), nullable=False)  # email|phone|profile
    status: Mapped[str] = mapped_column(sa.String(16), default="ok", nullable=False)
    payload: Mapped[dict] = mapped_column(sa.JSON, default=dict, nullable=False)
    limitation: Mapped[str | None] = mapped_column(sa.Text)


class Campaign(Base, TimestampMixin):
    __tablename__ = "campaigns"

    id: Mapped[uuid.UUID] = mapped_column(sa.Uuid, primary_key=True, default=new_uuid)
    tenant_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(sa.String(160), nullable=False)
    status: Mapped[str] = mapped_column(sa.String(16), default="draft", nullable=False)  # draft|active|paused|completed
    daily_cap: Mapped[int | None] = mapped_column(sa.Integer)
    ramp_started_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    pause_reason: Mapped[str | None] = mapped_column(sa.Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column(sa.ForeignKey("users.id", ondelete="SET NULL"))

    sequence: Mapped[Sequence | None] = relationship(back_populates="campaign", uselist=False, cascade="all, delete-orphan")


class Sequence(Base, TimestampMixin):
    __tablename__ = "sequences"

    id: Mapped[uuid.UUID] = mapped_column(sa.Uuid, primary_key=True, default=new_uuid)
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("campaigns.id", ondelete="CASCADE"), unique=True, index=True
    )
    name: Mapped[str] = mapped_column(sa.String(160), default="Default sequence", nullable=False)

    campaign: Mapped[Campaign] = relationship(back_populates="sequence")
    steps: Mapped[list[SequenceStep]] = relationship(
        back_populates="sequence", cascade="all, delete-orphan", order_by="SequenceStep.step_no"
    )


class SequenceStep(Base, TimestampMixin):
    __tablename__ = "sequence_steps"
    __table_args__ = (sa.UniqueConstraint("sequence_id", "step_no", name="uq_step_sequence_no"),)

    id: Mapped[uuid.UUID] = mapped_column(sa.Uuid, primary_key=True, default=new_uuid)
    sequence_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("sequences.id", ondelete="CASCADE"), index=True)
    step_no: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    kind: Mapped[str] = mapped_column(sa.String(16), default="message", nullable=False)  # connect|message
    body_template: Mapped[str] = mapped_column(sa.Text, nullable=False)
    delay_days: Mapped[int] = mapped_column(sa.Integer, default=2, nullable=False)

    sequence: Mapped[Sequence] = relationship(back_populates="steps")


class Message(Base, TimestampMixin):
    __tablename__ = "messages"

    id: Mapped[uuid.UUID] = mapped_column(sa.Uuid, primary_key=True, default=new_uuid)
    tenant_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    campaign_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("campaigns.id", ondelete="CASCADE"), index=True)
    lead_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("leads.id", ondelete="CASCADE"), index=True)
    contact_id: Mapped[uuid.UUID | None] = mapped_column(sa.ForeignKey("contacts.id", ondelete="SET NULL"))
    step_no: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    body: Mapped[str] = mapped_column(sa.Text, nullable=False)
    status: Mapped[str] = mapped_column(sa.String(16), default="queued", nullable=False)  # queued|sent|failed|skipped
    scheduled_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    sent_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    error: Mapped[str | None] = mapped_column(sa.Text)
    meta: Mapped[dict] = mapped_column(sa.JSON, default=dict, nullable=False)


class Reply(Base, TimestampMixin):
    __tablename__ = "replies"

    id: Mapped[uuid.UUID] = mapped_column(sa.Uuid, primary_key=True, default=new_uuid)
    tenant_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    campaign_id: Mapped[uuid.UUID | None] = mapped_column(sa.ForeignKey("campaigns.id", ondelete="SET NULL"))
    lead_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("leads.id", ondelete="CASCADE"), index=True)
    linkedin_account_id: Mapped[uuid.UUID | None] = mapped_column(sa.ForeignKey("linkedin_accounts.id"))
    body: Mapped[str] = mapped_column(sa.Text, nullable=False)
    received_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), default=utcnow, nullable=False)
    stop_sequence: Mapped[bool] = mapped_column(sa.Boolean, default=True, nullable=False)
    read_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))


class LinkedinAccount(Base, TimestampMixin):
    __tablename__ = "linkedin_accounts"

    id: Mapped[uuid.UUID] = mapped_column(sa.Uuid, primary_key=True, default=new_uuid)
    tenant_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    handle: Mapped[str | None] = mapped_column(sa.String(200))
    status: Mapped[str] = mapped_column(sa.String(16), default="disconnected", nullable=False)
    # Encrypted storage_state JSON. Never returned by the API.
    session_blob: Mapped[str | None] = mapped_column(sa.Text)
    connected_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    paused_reason: Mapped[str | None] = mapped_column(sa.Text)
    connected_by: Mapped[uuid.UUID | None] = mapped_column(sa.ForeignKey("users.id", ondelete="SET NULL"))


class CreditsLedger(Base):
    """Append-only. Rows are inserted, never updated or deleted."""

    __tablename__ = "credits_ledger"
    __table_args__ = (
        sa.UniqueConstraint("tenant_id", "idempotency_key", name="uq_credit_idem"),
        sa.Index("ix_credit_tenant_created", "tenant_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(sa.Uuid, primary_key=True, default=new_uuid)
    tenant_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    delta: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    reason: Mapped[str] = mapped_column(sa.String(200), nullable=False)
    ref_type: Mapped[str | None] = mapped_column(sa.String(32))
    ref_id: Mapped[uuid.UUID | None] = mapped_column(sa.Uuid)
    balance_after: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    idempotency_key: Mapped[str | None] = mapped_column(sa.String(120))
    created_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), default=utcnow, nullable=False)


class Order(Base, TimestampMixin):
    __tablename__ = "orders"

    id: Mapped[uuid.UUID] = mapped_column(sa.Uuid, primary_key=True, default=new_uuid)
    tenant_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    provider: Mapped[str] = mapped_column(sa.String(24), default="stripe", nullable=False)
    provider_id: Mapped[str | None] = mapped_column(sa.String(120), unique=True)
    credits: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    amount_cents: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    currency: Mapped[str] = mapped_column(sa.String(3), default="usd", nullable=False)
    status: Mapped[str] = mapped_column(sa.String(16), default="pending", nullable=False)
    paid_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    checkout_url: Mapped[str | None] = mapped_column(sa.Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column(sa.ForeignKey("users.id", ondelete="SET NULL"))


class Invoice(Base, TimestampMixin):
    __tablename__ = "invoices"

    id: Mapped[uuid.UUID] = mapped_column(sa.Uuid, primary_key=True, default=new_uuid)
    tenant_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    order_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("orders.id", ondelete="CASCADE"))
    number: Mapped[str] = mapped_column(sa.String(40), nullable=False)
    amount_cents: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    url: Mapped[str | None] = mapped_column(sa.Text)
    issued_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), default=utcnow, nullable=False)


class AuditLog(Base):
    __tablename__ = "audit_log"
    __table_args__ = (sa.Index("ix_audit_tenant_created", "tenant_id", "created_at"),)

    id: Mapped[uuid.UUID] = mapped_column(sa.Uuid, primary_key=True, default=new_uuid)
    tenant_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    actor_type: Mapped[str] = mapped_column(sa.String(16), nullable=False)  # user|api_key|system
    actor_id: Mapped[str | None] = mapped_column(sa.String(64))
    action: Mapped[str] = mapped_column(sa.String(80), nullable=False)
    target_type: Mapped[str | None] = mapped_column(sa.String(40))
    target_id: Mapped[str | None] = mapped_column(sa.String(64))
    meta: Mapped[dict] = mapped_column(sa.JSON, default=dict, nullable=False)
    ip: Mapped[str | None] = mapped_column(sa.String(64))
    created_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), default=utcnow, nullable=False)


class Webhook(Base, TimestampMixin):
    __tablename__ = "webhooks"

    id: Mapped[uuid.UUID] = mapped_column(sa.Uuid, primary_key=True, default=new_uuid)
    tenant_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    url: Mapped[str] = mapped_column(sa.Text, nullable=False)
    secret: Mapped[str] = mapped_column(sa.String(120), nullable=False)
    events: Mapped[list] = mapped_column(sa.JSON, default=list, nullable=False)
    active: Mapped[bool] = mapped_column(sa.Boolean, default=True, nullable=False)


class WebhookDelivery(Base):
    __tablename__ = "webhook_deliveries"

    id: Mapped[uuid.UUID] = mapped_column(sa.Uuid, primary_key=True, default=new_uuid)
    webhook_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("webhooks.id", ondelete="CASCADE"), index=True)
    event: Mapped[str] = mapped_column(sa.String(60), nullable=False)
    payload: Mapped[dict] = mapped_column(sa.JSON, default=dict, nullable=False)
    status: Mapped[str] = mapped_column(sa.String(16), default="pending", nullable=False)
    attempts: Mapped[int] = mapped_column(sa.Integer, default=0, nullable=False)
    response_code: Mapped[int | None] = mapped_column(sa.Integer)
    error: Mapped[str | None] = mapped_column(sa.Text)
    created_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), default=utcnow, nullable=False)
    delivered_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))


class McpSession(Base):
    __tablename__ = "mcp_sessions"

    id: Mapped[uuid.UUID] = mapped_column(sa.Uuid, primary_key=True, default=new_uuid)
    tenant_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    api_key_id: Mapped[uuid.UUID | None] = mapped_column(sa.ForeignKey("api_keys.id", ondelete="SET NULL"))
    client_name: Mapped[str | None] = mapped_column(sa.String(120))
    started_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), default=utcnow, nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), default=utcnow, nullable=False)


class IdempotencyKey(Base):
    __tablename__ = "idempotency_keys"
    __table_args__ = (sa.UniqueConstraint("tenant_id", "key", name="uq_idem_tenant_key"),)

    id: Mapped[uuid.UUID] = mapped_column(sa.Uuid, primary_key=True, default=new_uuid)
    tenant_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    key: Mapped[str] = mapped_column(sa.String(120), nullable=False)
    method: Mapped[str] = mapped_column(sa.String(10), nullable=False)
    path: Mapped[str] = mapped_column(sa.String(200), nullable=False)
    status_code: Mapped[int | None] = mapped_column(sa.Integer)
    response_body: Mapped[dict | None] = mapped_column(sa.JSON)
    created_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), default=utcnow, nullable=False)
