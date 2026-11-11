"""Append-only audit trail for every consequential action."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.orm import Session

from .models import AuditLog


def record(
    db: Session,
    tenant_id: uuid.UUID,
    action: str,
    actor_type: str = "system",
    actor_id: str | None = None,
    target_type: str | None = None,
    target_id: str | uuid.UUID | None = None,
    meta: dict[str, Any] | None = None,
    ip: str | None = None,
) -> AuditLog:
    entry = AuditLog(
        tenant_id=tenant_id,
        action=action,
        actor_type=actor_type,
        actor_id=str(actor_id) if actor_id else None,
        target_type=target_type,
        target_id=str(target_id) if target_id else None,
        meta=meta or {},
        ip=ip,
    )
    db.add(entry)
    return entry
