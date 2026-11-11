"""Tenant, onboarding, team and API-key management."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import sqlalchemy as sa
from fastapi import APIRouter
from sqlalchemy.orm import Session

from .. import audit, security
from ..deps import ActorDep, DbSession, OwnerDep, WriterDep
from ..errors import ApiError
from ..models import ApiKey, Membership, Target, Tenant, User
from ..schemas import (
    ApiKeyCreate,
    ApiKeyCreated,
    ApiKeyOut,
    MemberInvite,
    MemberOut,
    MemberRoleUpdate,
    TargetIn,
    TenantOut,
    TenantUpdate,
    WatchlistCreate,
)
from ..services.discovery import BriefError, build_icp, discover_targets, normalize_domain

router = APIRouter(prefix="/tenant", tags=["tenant"])


@router.get("", response_model=TenantOut)
def get_tenant(actor: ActorDep):
    return actor.tenant


@router.patch("", response_model=TenantOut)
def update_tenant(payload: TenantUpdate, actor: WriterDep, db: DbSession):
    tenant = actor.tenant
    for field in ("name", "website", "icp", "onboarding_complete"):
        value = getattr(payload, field)
        if value is not None:
            setattr(tenant, field, value)
    audit.record(db, actor.tenant_id, "tenant.updated", actor.actor_type, actor.actor_id, "tenant", tenant.id)
    db.commit()
    return tenant


@router.post("/onboarding", response_model=TenantOut)
async def onboarding(payload: WatchlistCreate, actor: WriterDep, db: DbSession):
    """Paste a website: build the ICP brief, create the watchlist and (optionally) discover targets."""
    tenant = actor.tenant
    if payload.website:
        tenant.website = str(payload.website)
        try:
            tenant.icp, tenant.icp_source = await build_icp(str(payload.website))
        except BriefError as exc:
            # A thin or unreachable site must not block onboarding: fall back to the
            # offer the user pasted, and only fail when there is nothing to work from.
            if not payload.offer:
                raise ApiError("brief_failed", str(exc), status_code=422) from exc
            tenant.icp = {**(tenant.icp or {}), "offer": payload.offer}
            tenant.icp_source = "manual"
    overrides = payload.model_dump(exclude_none=True, include={"offer", "buyers", "roles", "region", "exclusions"})
    if overrides:
        tenant.icp = {**(tenant.icp or {}), **overrides}

    for target in payload.targets:
        _add_target(db, tenant, target)

    if payload.discover:
        found = await discover_targets(tenant.icp or {}, limit=20)
        for candidate in found:
            _add_target(
                db,
                tenant,
                TargetIn(company=candidate.company, domain=candidate.domain, country=candidate.country),
            )

    tenant.onboarding_complete = True
    audit.record(
        db, tenant.id, "tenant.onboarding", actor.actor_type, actor.actor_id, "tenant", tenant.id,
        meta={"icp_source": tenant.icp_source, "targets": len(payload.targets), "discover": payload.discover},
    )
    db.commit()
    return tenant


def _add_target(db: Session, tenant: Tenant, target: TargetIn) -> None:
    domain = normalize_domain(target.domain)
    if not domain:
        return
    exists = db.scalar(sa.select(Target.id).where(Target.tenant_id == tenant.id, Target.domain == domain))
    if exists:
        return
    db.add(
        Target(
            tenant_id=tenant.id,
            company=target.company,
            domain=domain,
            country=(target.country or "").upper()[:2] or None,
            employer=target.employer,
            news_query=target.news_query,
            careers_url=target.careers_url,
        )
    )


@router.get("/members", response_model=list[MemberOut])
def list_members(actor: ActorDep, db: DbSession):
    rows = db.execute(
        sa.select(Membership, User).join(User, User.id == Membership.user_id).where(
            Membership.tenant_id == actor.tenant_id
        )
    ).all()
    return [
        MemberOut(
            id=m.id, user_id=u.id, email=u.email, name=u.name, role=m.role, created_at=m.created_at
        )
        for m, u in rows
    ]


@router.post("/members", response_model=MemberOut, status_code=201)
def invite_member(payload: MemberInvite, actor: OwnerDep, db: DbSession):
    email = payload.email.lower()
    user = db.scalar(sa.select(User).where(User.email == email))
    if not user:
        if not payload.password:
            raise ApiError(
                "password_required",
                "This person has no account yet: supply an initial password.",
                status_code=422,
            )
        user = User(email=email, name=payload.name, password_hash=security.hash_password(payload.password))
        db.add(user)
        db.flush()
    membership = db.scalar(
        sa.select(Membership).where(Membership.tenant_id == actor.tenant_id, Membership.user_id == user.id)
    )
    if membership:
        raise ApiError("already_member", "This person is already in the workspace.", status_code=409)
    membership = Membership(tenant_id=actor.tenant_id, user_id=user.id, role=payload.role)
    db.add(membership)
    audit.record(db, actor.tenant_id, "member.added", actor.actor_type, actor.actor_id, "user", user.id,
                 meta={"role": payload.role})
    db.commit()
    return MemberOut(id=membership.id, user_id=user.id, email=user.email, name=user.name, role=membership.role,
                     created_at=membership.created_at)


@router.patch("/members/{membership_id}", response_model=MemberOut)
def change_role(membership_id: uuid.UUID, payload: MemberRoleUpdate, actor: OwnerDep, db: DbSession):
    membership = db.scalar(
        sa.select(Membership).where(Membership.id == membership_id, Membership.tenant_id == actor.tenant_id)
    )
    if not membership:
        raise ApiError("not_found", "Membership not found.", status_code=404)
    if membership.role == "owner" and payload.role != "owner":
        owners = db.scalar(
            sa.select(sa.func.count()).select_from(Membership).where(
                Membership.tenant_id == actor.tenant_id, Membership.role == "owner"
            )
        )
        if int(owners or 0) <= 1:
            raise ApiError("last_owner", "A workspace needs at least one owner.", status_code=409)
    membership.role = payload.role
    audit.record(db, actor.tenant_id, "member.role_changed", actor.actor_type, actor.actor_id, "user",
                 membership.user_id, meta={"role": payload.role})
    db.commit()
    user = db.get(User, membership.user_id)
    return MemberOut(id=membership.id, user_id=membership.user_id, email=user.email, name=user.name,
                     role=membership.role, created_at=membership.created_at)


@router.delete("/members/{membership_id}", status_code=204)
def remove_member(membership_id: uuid.UUID, actor: OwnerDep, db: DbSession):
    membership = db.scalar(
        sa.select(Membership).where(Membership.id == membership_id, Membership.tenant_id == actor.tenant_id)
    )
    if not membership:
        raise ApiError("not_found", "Membership not found.", status_code=404)
    if membership.user_id == actor.user.id:
        raise ApiError("self_remove", "You cannot remove yourself.", status_code=409)
    db.delete(membership)
    audit.record(db, actor.tenant_id, "member.removed", actor.actor_type, actor.actor_id, "user", membership.user_id)
    db.commit()


@router.get("/api-keys", response_model=list[ApiKeyOut])
def list_api_keys(actor: OwnerDep, db: DbSession):
    return db.scalars(
        sa.select(ApiKey).where(ApiKey.tenant_id == actor.tenant_id, ApiKey.revoked_at.is_(None))
        .order_by(ApiKey.created_at.desc())
    ).all()


@router.post("/api-keys", response_model=ApiKeyCreated, status_code=201)
def create_api_key(payload: ApiKeyCreate, actor: OwnerDep, db: DbSession):
    plaintext, prefix, digest = security.new_api_key()
    record = ApiKey(tenant_id=actor.tenant_id, name=payload.name, prefix=prefix, key_hash=digest,
                    created_by=actor.user.id)
    db.add(record)
    audit.record(db, actor.tenant_id, "api_key.created", actor.actor_type, actor.actor_id, "api_key", record.id,
                 meta={"name": payload.name})
    db.commit()
    return ApiKeyCreated(
        id=record.id, name=record.name, prefix=record.prefix, last_used_at=None, created_at=record.created_at,
        api_key=plaintext,
    )


@router.delete("/api-keys/{key_id}", status_code=204)
def revoke_api_key(key_id: uuid.UUID, actor: OwnerDep, db: DbSession):
    record = db.scalar(sa.select(ApiKey).where(ApiKey.id == key_id, ApiKey.tenant_id == actor.tenant_id))
    if not record:
        raise ApiError("not_found", "API key not found.", status_code=404)
    record.revoked_at = datetime.now(UTC)
    audit.record(db, actor.tenant_id, "api_key.revoked", actor.actor_type, actor.actor_id, "api_key", key_id)
    db.commit()
