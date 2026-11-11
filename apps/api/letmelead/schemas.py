"""Pydantic contracts for the REST API (and the source of the OpenAPI schema)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, EmailStr, Field, HttpUrl

T = TypeVar("T")


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page(BaseModel, Generic[T]):
    items: list[T]
    next_cursor: str | None = None


# ----------------------------------------------------------------------------- auth


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=200)
    name: str | None = Field(default=None, max_length=160)
    company_name: str | None = Field(default=None, max_length=160)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class TenantSummary(ORMModel):
    id: uuid.UUID
    name: str
    slug: str
    role: str


class MeResponse(BaseModel):
    user: dict
    tenants: list[TenantSummary]
    active_tenant_id: uuid.UUID | None = None


# ----------------------------------------------------------------------------- tenants


class TenantOut(ORMModel):
    id: uuid.UUID
    name: str
    slug: str
    website: str | None
    icp: dict
    icp_source: str | None
    onboarding_complete: bool
    created_at: datetime


class TenantUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=160)
    website: str | None = Field(default=None, max_length=300)
    icp: dict | None = None
    onboarding_complete: bool | None = None


class MemberOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    email: str
    name: str | None
    role: str
    created_at: datetime


class MemberInvite(BaseModel):
    email: EmailStr
    role: Literal["owner", "member", "viewer"] = "member"
    password: str | None = Field(default=None, min_length=10, max_length=200)
    name: str | None = None


class MemberRoleUpdate(BaseModel):
    role: Literal["owner", "member", "viewer"]


# ----------------------------------------------------------------------------- api keys


class ApiKeyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class ApiKeyOut(ORMModel):
    id: uuid.UUID
    name: str
    prefix: str
    last_used_at: datetime | None
    created_at: datetime


class ApiKeyCreated(ApiKeyOut):
    api_key: str


# ----------------------------------------------------------------------------- sources


class SourceOut(ORMModel):
    id: uuid.UUID
    kind: str
    name: str
    enabled: bool
    config: dict
    daily_quota: int
    last_run_at: datetime | None
    last_status: str | None
    last_error: str | None


class SourceUpdate(BaseModel):
    enabled: bool | None = None
    daily_quota: int | None = Field(default=None, ge=1, le=1000)
    config: dict | None = None


class TargetIn(BaseModel):
    company: str = Field(min_length=1, max_length=200)
    domain: str = Field(min_length=3, max_length=253)
    country: str | None = Field(default=None, min_length=2, max_length=2)
    employer: str | None = None
    news_query: str | None = None
    careers_url: str | None = None


class TargetOut(ORMModel):
    id: uuid.UUID
    company: str
    domain: str
    country: str | None
    active: bool
    created_at: datetime


class WatchlistCreate(BaseModel):
    website: HttpUrl | None = None
    offer: str | None = None
    buyers: list[str] | None = None
    roles: list[str] | None = None
    region: str | None = None
    exclusions: list[str] | None = None
    targets: list[TargetIn] = Field(default_factory=list)
    discover: bool = False


# ----------------------------------------------------------------------------- signals


class SignalOut(ORMModel):
    id: uuid.UUID
    source: str
    type: str
    strength: str
    title: str
    url: str | None
    published_at: datetime | None
    points: float


# ----------------------------------------------------------------------------- leads


class ContactOut(ORMModel):
    id: uuid.UUID
    name: str | None
    title: str | None
    linkedin_url: str | None
    email: str | None
    phone: str | None
    confidence: float
    verified: bool


class LeadOut(ORMModel):
    id: uuid.UUID
    company: str
    domain: str
    reason: str
    signal_at: datetime | None
    signal_age_days: int | None
    score: float
    fit: str
    fit_confidence: float
    fit_reason: str | None
    verification_status: str
    status: str
    linkedin_url: str | None
    email: str | None
    claimed_at: datetime | None
    created_at: datetime


class LeadDetail(LeadOut):
    evidence: list[SignalOut] = Field(default_factory=list)
    contacts: list[ContactOut] = Field(default_factory=list)
    fit_evidence: dict = Field(default_factory=dict)


class ClaimResponse(BaseModel):
    lead: LeadOut
    credits_charged: int
    was_free: bool
    credits_remaining: int


class NotFitRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


class LeadUpdate(BaseModel):
    status: Literal["new", "claimed", "contacted", "replied", "meeting", "archived"] | None = None


# ----------------------------------------------------------------------------- campaigns


class SequenceStepIn(BaseModel):
    step_no: int = Field(ge=1, le=10)
    kind: Literal["connect", "message"] = "message"
    body_template: str = Field(min_length=5, max_length=2000)
    delay_days: int = Field(default=2, ge=0, le=30)


class SequenceIn(BaseModel):
    name: str = "Default sequence"
    steps: list[SequenceStepIn] = Field(min_length=1)


class SequenceStepOut(ORMModel):
    step_no: int
    kind: str
    body_template: str
    delay_days: int


class SequenceOut(BaseModel):
    id: uuid.UUID
    name: str
    steps: list[SequenceStepOut]


class CampaignCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    lead_ids: list[uuid.UUID] = Field(default_factory=list)
    sequence: SequenceIn | None = None


class CampaignOut(ORMModel):
    id: uuid.UUID
    name: str
    status: str
    daily_cap: int | None
    ramp_started_at: datetime | None
    pause_reason: str | None
    created_at: datetime


class CampaignDetail(CampaignOut):
    sequence: SequenceOut | None = None
    lead_count: int = 0
    messages_sent: int = 0
    pending: int = 0
    replies: int = 0


class CampaignPause(BaseModel):
    reason: str | None = None


class MessageOut(ORMModel):
    id: uuid.UUID
    campaign_id: uuid.UUID
    lead_id: uuid.UUID
    step_no: int
    body: str
    status: str
    scheduled_at: datetime | None
    sent_at: datetime | None
    error: str | None
    meta: dict


class ReplyOut(ORMModel):
    id: uuid.UUID
    campaign_id: uuid.UUID | None
    lead_id: uuid.UUID
    body: str
    received_at: datetime
    stop_sequence: bool
    read_at: datetime | None


# ----------------------------------------------------------------------------- linkedin


class LinkedinConnect(BaseModel):
    # Playwright storage_state JSON produced by `python -m letmelead.outreach.login`.
    storage_state: dict
    handle: str | None = None


class LinkedinAccountOut(ORMModel):
    id: uuid.UUID
    handle: str | None
    status: str
    connected_at: datetime | None
    paused_reason: str | None


# ----------------------------------------------------------------------------- billing


class LedgerEntryOut(ORMModel):
    id: uuid.UUID
    delta: int
    reason: str
    ref_type: str | None
    balance_after: int
    created_at: datetime


class BalanceOut(BaseModel):
    balance: int
    free_leads_used: int
    free_leads_remaining: int
    lead_price_credits: int
    spend_report: dict


class TopUpRequest(BaseModel):
    pack: int = Field(default=1, ge=1, le=20)


class OrderOut(ORMModel):
    id: uuid.UUID
    credits: int
    amount_cents: int
    currency: str
    status: str
    checkout_url: str | None
    paid_at: datetime | None
    created_at: datetime


class InvoiceOut(ORMModel):
    id: uuid.UUID
    order_id: uuid.UUID
    number: str
    amount_cents: int
    url: str | None
    issued_at: datetime


# ----------------------------------------------------------------------------- webhooks / audit


class WebhookCreate(BaseModel):
    url: HttpUrl
    events: list[Literal["lead.created", "lead.claimed", "reply.received"]] = Field(
        default_factory=lambda: ["lead.created", "lead.claimed", "reply.received"]
    )


class WebhookOut(ORMModel):
    id: uuid.UUID
    url: str
    events: list
    active: bool
    created_at: datetime


class AuditOut(ORMModel):
    id: uuid.UUID
    actor_type: str
    actor_id: str | None
    action: str
    target_type: str | None
    target_id: str | None
    meta: dict
    created_at: datetime


class HealthOut(BaseModel):
    status: str
    version: str
    providers: dict
