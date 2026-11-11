"""The signal catalog: read it, and turn signals on or off per tenant.

Toggling a signal keeps the tenant's source adapters in sync: enabling a signal
enables every adapter that looks for it; disabling one disables an adapter only
when no other enabled signal still needs it.
"""

from __future__ import annotations

import sqlalchemy as sa
from fastapi import APIRouter
from pydantic import BaseModel

from .. import audit
from ..deps import ActorDep, DbSession, WriterDep
from ..errors import ApiError
from ..models import Source, TenantSignal
from ..services.adapters import (
    ADAPTERS,
    DEFAULT_SOURCES,  # noqa: F401  (re-exported for the UI contract test)
)
from ..signals_catalog import CATALOG, STATUS_LABEL, category_list

router = APIRouter(prefix="/signals", tags=["signals"])


class SignalToggle(BaseModel):
    enabled: bool


def _enabled_map(db: DbSession, tenant_id) -> dict[str, bool]:
    rows = db.scalars(sa.select(TenantSignal).where(TenantSignal.tenant_id == tenant_id)).all()
    return {row.signal_id: row.enabled for row in rows}


@router.get("/catalog")
def catalog(actor: ActorDep, db: DbSession):
    """The full grouped catalog, merged with this tenant's on/off state."""
    overrides = _enabled_map(db, actor.tenant_id)
    categories = category_list()
    for category in categories:
        for signal in category["signals"]:
            definition = CATALOG[signal["id"]]
            signal["enabled"] = overrides.get(signal["id"], definition.enabled_by_default)
            signal["status_label"] = STATUS_LABEL[signal["status"]]
    return {
        "categories": categories,
        "legend": {
            "live": "Found automatically on every lead search.",
            "partly_live": "Found automatically in some cases.",
            "by_hand": "Not automatic yet. We research it by hand when you order leads on it.",
        },
    }


@router.put("/{signal_id}")
def toggle(signal_id: str, payload: SignalToggle, actor: WriterDep, db: DbSession):
    definition = CATALOG.get(signal_id)
    if not definition:
        raise ApiError("unknown_signal", f"Unknown signal: {signal_id}", status_code=404)
    if payload.enabled and not definition.automatic:
        raise ApiError(
            "not_automatic",
            "This signal is not automatic yet, so there is nothing behind the switch. It is researched by hand when you order leads on it.",
            status_code=422,
        )

    row = db.scalar(
        sa.select(TenantSignal).where(
            TenantSignal.tenant_id == actor.tenant_id, TenantSignal.signal_id == signal_id
        )
    )
    if row:
        row.enabled = payload.enabled
    else:
        row = TenantSignal(tenant_id=actor.tenant_id, signal_id=signal_id, enabled=payload.enabled)
        db.add(row)
    # The session runs with autoflush off: without this flush the adapter sync
    # would not see the row we just wrote.
    db.flush()

    _sync_adapters(db, actor.tenant_id)
    audit.record(db, actor.tenant_id, "signal.toggled", actor.actor_type, actor.actor_id, "signal", signal_id,
                 meta={"enabled": payload.enabled})
    db.commit()
    return {"id": signal_id, "enabled": payload.enabled, "status": definition.status}


def _sync_adapters(db: DbSession, tenant_id) -> None:
    """Mirror the catalog selection onto the tenant's source adapters.

    Enabling a signal turns on its adapters (with a config default so the scan
    has something to work from). Disabling one turns an adapter off only when
    no enabled signal still maps to it.
    """
    overrides = _enabled_map(db, tenant_id)
    wanted: set[str] = set()
    for signal_id, definition in CATALOG.items():
        on = overrides.get(signal_id, definition.enabled_by_default)
        if on and definition.automatic:
            wanted.update(definition.adapters)

    sources = db.scalars(sa.select(Source).where(Source.tenant_id == tenant_id)).all()
    existing = {source.kind: source for source in sources}
    for kind in set(ADAPTERS) | wanted:
        source = existing.get(kind)
        if source is None:
            adapter = ADAPTERS[kind]
            db.add(
                Source(
                    tenant_id=tenant_id,
                    kind=kind,
                    name=adapter.label,
                    enabled=kind in wanted,
                    config={},
                )
            )
        else:
            # The switch is the source of truth in both directions: an adapter
            # stays on only while an enabled signal still needs it.
            source.enabled = kind in wanted
