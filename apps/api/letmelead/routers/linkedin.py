"""LinkedIn account connection (stored browser session) and pause controls."""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime

import sqlalchemy as sa
from fastapi import APIRouter
from pydantic import BaseModel

from .. import audit, security
from ..config import settings
from ..deps import ActorDep, DbSession, WriterDep
from ..errors import ApiError
from ..models import LinkedinAccount
from ..schemas import LinkedinAccountOut, LinkedinConnect
from ..services.pacing import current_cap

router = APIRouter(prefix="/linkedin", tags=["linkedin"])


class PauseRequest(BaseModel):
    reason: str = "paused by user"


@router.get("", response_model=list[LinkedinAccountOut])
def list_accounts(actor: ActorDep, db: DbSession):
    return db.scalars(sa.select(LinkedinAccount).where(LinkedinAccount.tenant_id == actor.tenant_id)).all()


@router.post("/connect", response_model=LinkedinAccountOut)
def connect(payload: LinkedinConnect, actor: WriterDep, db: DbSession):
    if not settings.session_encryption_key:
        raise ApiError(
            "encryption_not_configured",
            "Set SESSION_ENCRYPTION_KEY before storing LinkedIn sessions.",
            status_code=503,
        )
    state = payload.storage_state or {}
    if not state.get("cookies"):
        raise ApiError(
            "invalid_session",
            "storage_state must be a Playwright storage state containing cookies.",
            status_code=422,
        )
    account = db.scalar(sa.select(LinkedinAccount).where(LinkedinAccount.tenant_id == actor.tenant_id))
    if not account:
        account = LinkedinAccount(tenant_id=actor.tenant_id)
        db.add(account)
        db.flush()
    account.session_blob = security.encrypt_secret(json.dumps(state))
    account.handle = payload.handle or account.handle
    account.status = "connected"
    account.connected_at = datetime.now(UTC)
    account.paused_reason = None
    account.connected_by = actor.user.id if actor.user else None
    audit.record(db, actor.tenant_id, "linkedin.connected", actor.actor_type, actor.actor_id, "linkedin_account",
                 account.id, meta={"handle": account.handle})
    db.commit()
    return account


@router.post("/pause", response_model=LinkedinAccountOut)
def pause(payload: PauseRequest, actor: WriterDep, db: DbSession):
    account = db.scalar(sa.select(LinkedinAccount).where(LinkedinAccount.tenant_id == actor.tenant_id))
    if not account:
        raise ApiError("not_found", "No LinkedIn account connected.", status_code=404)
    account.status = "paused"
    account.paused_reason = payload.reason[:400]
    audit.record(db, actor.tenant_id, "linkedin.paused", actor.actor_type, actor.actor_id, "linkedin_account",
                 account.id, meta={"reason": payload.reason[:200]})
    db.commit()
    return account


@router.post("/resume", response_model=LinkedinAccountOut)
def resume(actor: WriterDep, db: DbSession):
    account = db.scalar(sa.select(LinkedinAccount).where(LinkedinAccount.tenant_id == actor.tenant_id))
    if not account:
        raise ApiError("not_found", "No LinkedIn account connected.", status_code=404)
    if not account.session_blob:
        raise ApiError("no_session", "Reconnect the account: no session is stored.", status_code=409)
    account.status = "connected"
    account.paused_reason = None
    audit.record(db, actor.tenant_id, "linkedin.resumed", actor.actor_type, actor.actor_id, "linkedin_account",
                 account.id)
    db.commit()
    return account


@router.get("/limits")
def limits(actor: ActorDep, db: DbSession):
    account = db.scalar(sa.select(LinkedinAccount).where(LinkedinAccount.tenant_id == actor.tenant_id))
    if not account:
        return {"connected": False, "current_daily_cap": None, "outreach_enabled": settings.outreach_enabled}
    return {
        "connected": account.status == "connected",
        "status": account.status,
        "current_daily_cap": current_cap(account.connected_at),
        "max_daily_cap": settings.outreach_max_daily_cap,
        "outreach_enabled": settings.outreach_enabled,
        "dry_run": settings.outreach_dry_run,
    }


@router.delete("/{account_id}", status_code=204)
def disconnect(account_id: uuid.UUID, actor: WriterDep, db: DbSession):
    account = db.scalar(
        sa.select(LinkedinAccount).where(LinkedinAccount.id == account_id, LinkedinAccount.tenant_id == actor.tenant_id)
    )
    if not account:
        raise ApiError("not_found", "Account not found.", status_code=404)
    account.session_blob = None
    account.status = "disconnected"
    audit.record(db, actor.tenant_id, "linkedin.disconnected", actor.actor_type, actor.actor_id, "linkedin_account",
                 account.id)
    db.commit()
