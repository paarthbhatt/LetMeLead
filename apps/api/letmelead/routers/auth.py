"""Signup, login, refresh, Google OAuth and identity endpoints."""

from __future__ import annotations

import logging
import re
import secrets
import uuid
from urllib.parse import urlencode

import httpx
import jwt
import sqlalchemy as sa
from fastapi import APIRouter, Response
from fastapi.responses import RedirectResponse

from .. import security
from ..config import settings
from ..deps import ActorDep, DbSession
from ..errors import ApiError
from ..models import Membership, Source, Tenant, User
from ..schemas import LoginRequest, MeResponse, RefreshRequest, SignupRequest, TokenPair
from ..services.adapters import ADAPTERS, DEFAULT_SOURCES

logger = logging.getLogger("letmelead.auth")
router = APIRouter(prefix="/auth", tags=["auth"])


def _slug(value: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")[:40] or "workspace"
    return f"{base}-{secrets.token_hex(3)}"


def _tokens(user: User, tenant_id: uuid.UUID, role: str) -> TokenPair:
    access = security.create_token(str(user.id), security.ACCESS, str(tenant_id), role)
    refresh = security.create_token(str(user.id), security.REFRESH, str(tenant_id), role)
    return TokenPair(
        access_token=access,
        refresh_token=refresh,
        expires_in=settings.access_token_minutes * 60,
    )


def _default_sources(db, tenant: Tenant) -> None:
    for kind in DEFAULT_SOURCES:
        adapter = ADAPTERS[kind]
        db.add(
            Source(
                tenant_id=tenant.id,
                kind=kind,
                name=adapter.label,
                enabled=True,
                config={"roles": (tenant.icp or {}).get("roles") or []},
            )
        )


def _first_tenant(db, user: User) -> Membership | None:
    return db.scalar(
        sa.select(Membership).where(Membership.user_id == user.id).order_by(Membership.created_at.asc())
    )


@router.post("/signup", response_model=TokenPair, status_code=201)
def signup(payload: SignupRequest, db: DbSession):
    email = payload.email.lower()
    if db.scalar(sa.select(User.id).where(User.email == email)):
        raise ApiError("email_taken", "An account with this email already exists.", status_code=409)
    user = User(
        email=email,
        name=payload.name,
        password_hash=security.hash_password(payload.password),
    )
    db.add(user)
    db.flush()

    tenant = Tenant(
        name=payload.company_name or (payload.name or email.split("@")[0]) + "'s workspace",
        slug=_slug(payload.company_name or email.split("@")[0]),
        icp={},
    )
    db.add(tenant)
    db.flush()
    db.add(Membership(tenant_id=tenant.id, user_id=user.id, role="owner"))
    _default_sources(db, tenant)
    db.commit()
    return _tokens(user, tenant.id, "owner")


@router.post("/login", response_model=TokenPair)
def login(payload: LoginRequest, db: DbSession):
    user = db.scalar(sa.select(User).where(User.email == payload.email.lower()))
    if not user or not security.verify_password(payload.password, user.password_hash):
        raise ApiError("invalid_credentials", "Email or password is incorrect.", status_code=401)
    if not user.is_active:
        raise ApiError("account_disabled", "This account is disabled.", status_code=403)
    membership = _first_tenant(db, user)
    if not membership:
        raise ApiError("no_tenant", "This account has no workspace.", status_code=403)
    return _tokens(user, membership.tenant_id, membership.role)


@router.post("/refresh", response_model=TokenPair)
def refresh(payload: RefreshRequest, db: DbSession):
    try:
        claims = security.decode_token(payload.refresh_token, security.REFRESH)
    except jwt.InvalidTokenError as exc:
        raise ApiError("invalid_token", "Refresh token is invalid or expired.", status_code=401) from exc
    user = db.get(User, uuid.UUID(claims["sub"]))
    if not user or not user.is_active:
        raise ApiError("invalid_token", "User no longer active.", status_code=401)
    membership = db.scalar(
        sa.select(Membership).where(
            Membership.user_id == user.id, Membership.tenant_id == uuid.UUID(claims["tid"])
        )
    )
    if not membership:
        raise ApiError("forbidden", "Membership revoked.", status_code=403)
    return _tokens(user, membership.tenant_id, membership.role)


@router.get("/me", response_model=MeResponse)
def me(actor: ActorDep, db: DbSession):
    memberships = db.execute(
        sa.select(Membership, Tenant)
        .join(Tenant, Tenant.id == Membership.tenant_id)
        .where(Membership.user_id == actor.user.id)
        .order_by(Tenant.name)
    ).all()
    return MeResponse(
        user={
            "id": str(actor.user.id),
            "email": actor.user.email,
            "name": actor.user.name,
        },
        tenants=[
            {"id": t.id, "name": t.name, "slug": t.slug, "role": m.role} for m, t in memberships
        ],
        active_tenant_id=actor.tenant_id,
    )


@router.post("/switch-tenant", response_model=TokenPair)
def switch_tenant(tenant_id: uuid.UUID, actor: ActorDep, db: DbSession):
    membership = db.scalar(
        sa.select(Membership).where(Membership.user_id == actor.user.id, Membership.tenant_id == tenant_id)
    )
    if not membership:
        raise ApiError("forbidden", "You are not a member of this workspace.", status_code=403)
    return _tokens(actor.user, membership.tenant_id, membership.role)


def _google_configured() -> bool:
    return bool(settings.google_client_id and settings.google_client_secret)


@router.get("/google")
def google_start():
    if not _google_configured():
        raise ApiError("oauth_not_configured", "Google sign-in is not configured on this instance.", status_code=501)
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "select_account",
    }
    return RedirectResponse(f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}")


@router.get("/google/callback")
async def google_callback(code: str, db: DbSession):
    if not _google_configured():
        raise ApiError("oauth_not_configured", "Google sign-in is not configured.", status_code=501)
    async with httpx.AsyncClient(timeout=20) as client:
        token_res = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": settings.google_redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        if token_res.status_code >= 400:
            raise ApiError("oauth_failed", "Google rejected the authorization code.", status_code=400)
        access = token_res.json().get("access_token")
        info_res = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo", headers={"Authorization": f"Bearer {access}"}
        )
    if info_res.status_code >= 400:
        raise ApiError("oauth_failed", "Could not read the Google profile.", status_code=400)
    info = info_res.json()
    email = (info.get("email") or "").lower()
    if not email:
        raise ApiError("oauth_failed", "Google did not return an email address.", status_code=400)

    user = db.scalar(sa.select(User).where(User.email == email))
    if not user:
        user = User(email=email, name=info.get("name"), google_sub=info.get("id"))
        db.add(user)
        db.flush()
        tenant = Tenant(name=(info.get("name") or email.split("@")[0]) + "'s workspace",
                        slug=_slug(info.get("name") or email.split("@")[0]), icp={})
        db.add(tenant)
        db.flush()
        db.add(Membership(tenant_id=tenant.id, user_id=user.id, role="owner"))
        _default_sources(db, tenant)
        db.commit()
    else:
        user.google_sub = user.google_sub or info.get("id")
        db.commit()

    membership = _first_tenant(db, user)
    if not membership:
        raise ApiError("no_tenant", "No workspace for this account.", status_code=403)
    tokens = _tokens(user, membership.tenant_id, membership.role)
    fragment = urlencode({"access_token": tokens.access_token, "refresh_token": tokens.refresh_token})
    return RedirectResponse(f"{settings.web_base_url}/auth/callback#{fragment}")


@router.post("/logout", status_code=204)
def logout(_actor: ActorDep, response: Response):
    # Access tokens are short-lived and stateless; the client discards the refresh token.
    response.status_code = 204
    return None
