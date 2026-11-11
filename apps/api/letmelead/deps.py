"""Request context, authentication and tenant scoping."""

from __future__ import annotations

import base64
import hashlib
import json
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Annotated, Any, Literal

import jwt
import sqlalchemy as sa
from fastapi import Depends, Header, Request
from sqlalchemy.orm import Session

from . import security
from .db import get_db
from .errors import ApiError
from .models import ApiKey, IdempotencyKey, Membership, Tenant, User

DbSession = Annotated[Session, Depends(get_db)]

ROLE_RANK = {"viewer": 1, "member": 2, "owner": 3}


@dataclass
class Actor:
    tenant: Tenant
    role: str
    actor_type: Literal["user", "api_key"]
    actor_id: str
    user: User | None = None
    api_key_id: uuid.UUID | None = None
    ip: str | None = None

    @property
    def tenant_id(self) -> uuid.UUID:
        return self.tenant.id

    def require(self, minimum: str) -> None:
        if ROLE_RANK.get(self.role, 0) < ROLE_RANK[minimum]:
            raise ApiError("forbidden", f"This action requires the {minimum} role.", status_code=403)


def _client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


def _load_tenant(db: Session, tenant_id: uuid.UUID) -> Tenant:
    tenant = db.get(Tenant, tenant_id)
    if not tenant:
        raise ApiError("tenant_not_found", "Tenant not found.", status_code=404)
    return tenant


def _from_bearer(db: Session, token: str, requested_tenant: str | None, request: Request) -> Actor:
    try:
        payload = security.decode_token(token, security.ACCESS)
    except jwt.ExpiredSignatureError as exc:
        raise ApiError("token_expired", "Access token expired.", status_code=401) from exc
    except jwt.InvalidTokenError as exc:
        raise ApiError("invalid_token", "Access token is invalid.", status_code=401) from exc

    user = db.get(User, uuid.UUID(payload["sub"]))
    if not user or not user.is_active:
        raise ApiError("invalid_token", "User no longer active.", status_code=401)

    tenant_id = requested_tenant or payload.get("tid")
    if not tenant_id:
        raise ApiError("tenant_required", "Select a tenant first.", status_code=400)
    membership = db.scalar(
        sa.select(Membership).where(
            Membership.tenant_id == uuid.UUID(str(tenant_id)),
            Membership.user_id == user.id,
        )
    )
    if not membership:
        raise ApiError("forbidden", "You are not a member of this tenant.", status_code=403)
    return Actor(
        tenant=_load_tenant(db, membership.tenant_id),
        role=membership.role,
        actor_type="user",
        actor_id=str(user.id),
        user=user,
        ip=_client_ip(request),
    )


def _from_api_key(db: Session, key: str, request: Request) -> Actor:
    prefix = key[:8]
    digest = security.hash_api_key(key)
    record = db.scalar(sa.select(ApiKey).where(ApiKey.prefix == prefix, ApiKey.key_hash == digest))
    if not record or record.revoked_at is not None:
        raise ApiError("invalid_api_key", "API key is invalid or revoked.", status_code=401)
    record.last_used_at = datetime.now(UTC)
    return Actor(
        tenant=_load_tenant(db, record.tenant_id),
        role="member",
        actor_type="api_key",
        actor_id=record.prefix,
        api_key_id=record.id,
        ip=_client_ip(request),
    )


def get_actor(
    request: Request,
    db: DbSession,
    authorization: Annotated[str | None, Header()] = None,
    x_api_key: Annotated[str | None, Header()] = None,
    x_tenant_id: Annotated[str | None, Header()] = None,
) -> Actor:
    if authorization and authorization.lower().startswith("bearer "):
        return _from_bearer(db, authorization[7:].strip(), x_tenant_id, request)
    if x_api_key:
        return _from_api_key(db, x_api_key, request)
    raise ApiError("unauthorized", "Provide a Bearer token or X-API-Key header.", status_code=401)


ActorDep = Annotated[Actor, Depends(get_actor)]


def require_role(minimum: str):
    def _dep(actor: ActorDep) -> Actor:
        actor.require(minimum)
        return actor

    return _dep


OwnerDep = Annotated[Actor, Depends(require_role("owner"))]
WriterDep = Annotated[Actor, Depends(require_role("member"))]



# --------------------------------------------------------------------------- pagination


def encode_cursor(created_at: datetime | None, row_id: uuid.UUID) -> str:
    payload = {"t": (created_at or datetime.now(UTC)).isoformat(), "i": str(row_id)}
    return base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode()


def decode_cursor(cursor: str | None) -> tuple[datetime, uuid.UUID] | None:
    if not cursor:
        return None
    try:
        raw = json.loads(base64.urlsafe_b64decode(cursor.encode()))
        return datetime.fromisoformat(raw["t"]), uuid.UUID(raw["i"])
    except Exception as exc:  # malformed cursor is a client error, not a 500
        raise ApiError("invalid_cursor", "The pagination cursor is invalid.", status_code=400) from exc


def apply_cursor(stmt: Any, model: Any, cursor: str | None, limit: int) -> Any:
    decoded = decode_cursor(cursor)
    if decoded:
        created_at, row_id = decoded
        stmt = stmt.where(sa.tuple_(model.created_at, model.id) < (created_at, row_id))
    return stmt.order_by(model.created_at.desc(), model.id.desc()).limit(limit + 1)


def page(rows: list[Any], limit: int, model: Any) -> tuple[list[Any], str | None]:
    has_more = len(rows) > limit
    items = rows[:limit]
    next_cursor = encode_cursor(items[-1].created_at, items[-1].id) if has_more and items else None
    return items, next_cursor


# --------------------------------------------------------------------------- idempotency


class Idempotent:
    """Replay-safe mutation helper keyed on the Idempotency-Key header."""

    def __init__(self, db: Session, actor: Actor, request: Request) -> None:
        self.db = db
        self.actor = actor
        self.key = request.headers.get("idempotency-key")
        self.method = request.method
        self.path = request.url.path
        self.stored: IdempotencyKey | None = None
        if self.key:
            if len(self.key) > 120:
                raise ApiError("invalid_idempotency_key", "Idempotency-Key is too long.", status_code=400)
            self.stored = db.scalar(
                sa.select(IdempotencyKey).where(
                    IdempotencyKey.tenant_id == actor.tenant_id, IdempotencyKey.key == self.key
                )
            )

    @property
    def replay(self) -> dict[str, Any] | None:
        if self.stored and self.stored.response_body is not None:
            return self.stored.response_body
        return None

    @property
    def status_code(self) -> int:
        return self.stored.status_code if self.stored and self.stored.status_code else 200

    def store(self, body: Any, status_code: int = 200) -> None:
        if not self.key:
            return
        payload = json.loads(json.dumps(body, default=str))
        if self.stored:
            self.stored.response_body = payload
            self.stored.status_code = status_code
        else:
            self.db.add(
                IdempotencyKey(
                    tenant_id=self.actor.tenant_id,
                    key=self.key,
                    method=self.method,
                    path=self.path,
                    response_body=payload,
                    status_code=status_code,
                )
            )
        self.db.commit()


def idempotency(actor: ActorDep, request: Request, db: DbSession) -> Idempotent:
    return Idempotent(db, actor, request)


IdempotencyDep = Annotated[Idempotent, Depends(idempotency)]


def fingerprint(*parts: str) -> str:
    return hashlib.sha1("|".join(parts).encode()).hexdigest()
