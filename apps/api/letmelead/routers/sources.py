"""Watchlists (sources) and target companies, plus scan triggering."""

from __future__ import annotations

import asyncio
import csv
import io
import logging
import uuid
from typing import Literal

import sqlalchemy as sa
from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel, Field

from .. import audit
from ..db import SessionLocal
from ..deps import ActorDep, DbSession, WriterDep
from ..errors import ApiError
from ..models import Source, Target
from ..schemas import Page, SourceOut, SourceUpdate, TargetIn, TargetOut
from ..services.adapters import ADAPTERS
from ..services.discovery import normalize_domain
from ..services.engine import run_scan

logger = logging.getLogger("letmelead.sources")
router = APIRouter(prefix="/sources", tags=["sources"])
targets_router = APIRouter(prefix="/targets", tags=["targets"])


class ScanRequest(BaseModel):
    sources: list[str] | None = None
    limit_targets: int = Field(default=50, ge=1, le=200)
    wait: bool = False


class ScanResponse(BaseModel):
    status: Literal["completed", "started"]
    report: dict | None = None


def _background_scan(tenant_id: uuid.UUID, kinds: list[str] | None, limit: int) -> None:
    db = SessionLocal()
    try:
        from ..models import Tenant

        tenant = db.get(Tenant, tenant_id)
        if tenant:
            asyncio.run(run_scan(db, tenant, kinds, limit))
    finally:
        db.close()


@router.get("", response_model=list[SourceOut])
def list_sources(actor: ActorDep, db: DbSession):
    return db.scalars(sa.select(Source).where(Source.tenant_id == actor.tenant_id).order_by(Source.kind)).all()


@router.patch("/{source_id}", response_model=SourceOut)
def update_source(source_id: uuid.UUID, payload: SourceUpdate, actor: WriterDep, db: DbSession):
    source = db.scalar(sa.select(Source).where(Source.id == source_id, Source.tenant_id == actor.tenant_id))
    if not source:
        raise ApiError("not_found", "Source not found.", status_code=404)
    for field in ("enabled", "daily_quota", "config"):
        value = getattr(payload, field)
        if value is not None:
            setattr(source, field, value)
    audit.record(db, actor.tenant_id, "source.updated", actor.actor_type, actor.actor_id, "source", source.id)
    db.commit()
    return source


@router.post("/scan", response_model=ScanResponse)
async def scan(payload: ScanRequest, actor: ActorDep, db: DbSession, background: BackgroundTasks):
    if payload.sources:
        unknown = [s for s in payload.sources if s not in ADAPTERS]
        if unknown:
            raise ApiError("unknown_source", f"Unknown source(s): {', '.join(unknown)}", status_code=422)
    if payload.wait:
        report = await run_scan(db, actor.tenant, payload.sources, payload.limit_targets)
        return ScanResponse(status="completed", report=report.as_dict())
    background.add_task(_background_scan, actor.tenant_id, payload.sources, payload.limit_targets)
    audit.record(db, actor.tenant_id, "scan.queued", actor.actor_type, actor.actor_id)
    db.commit()
    return ScanResponse(status="started")


@targets_router.get("", response_model=Page[TargetOut])
def list_targets(actor: ActorDep, db: DbSession, limit: int = 100, cursor: str | None = None):
    from ..deps import apply_cursor, page

    stmt = sa.select(Target).where(Target.tenant_id == actor.tenant_id)
    rows = list(db.scalars(apply_cursor(stmt, Target, cursor, min(limit, 500))).all())
    items, next_cursor = page(rows, min(limit, 500), Target)
    return Page(items=[TargetOut.model_validate(row) for row in items], next_cursor=next_cursor)


@targets_router.post("", response_model=TargetOut, status_code=201)
def add_target(payload: TargetIn, actor: WriterDep, db: DbSession):
    domain = normalize_domain(payload.domain)
    if not domain:
        raise ApiError("invalid_domain", "A domain is required.", status_code=422)
    exists = db.scalar(sa.select(Target).where(Target.tenant_id == actor.tenant_id, Target.domain == domain))
    if exists:
        raise ApiError("duplicate_target", "That company is already in your watchlist.", status_code=409)
    target = Target(
        tenant_id=actor.tenant_id,
        company=payload.company,
        domain=domain,
        country=(payload.country or "").upper()[:2] or None,
        employer=payload.employer,
        news_query=payload.news_query,
        careers_url=payload.careers_url,
    )
    db.add(target)
    audit.record(db, actor.tenant_id, "target.added", actor.actor_type, actor.actor_id, "target", target.id,
                 meta={"domain": domain})
    db.commit()
    return target


@targets_router.post("/import", response_model=dict)
def import_targets(text: str, actor: WriterDep, db: DbSession):
    """Import a CSV with company,domain[,country,employer,news_query,careers_url]."""
    reader = csv.DictReader(io.StringIO(text.strip()))
    if reader.fieldnames is None:
        raise ApiError("invalid_csv", "CSV needs a header row with company and domain.", status_code=422)
    added = skipped = 0
    for row in reader:
        company = (row.get("company") or "").strip()
        domain = normalize_domain(row.get("domain") or "")
        if not company or not domain:
            skipped += 1
            continue
        if db.scalar(sa.select(Target.id).where(Target.tenant_id == actor.tenant_id, Target.domain == domain)):
            skipped += 1
            continue
        db.add(
            Target(
                tenant_id=actor.tenant_id,
                company=company,
                domain=domain,
                country=(row.get("country") or "").upper()[:2] or None,
                employer=row.get("employer") or None,
                news_query=row.get("news_query") or None,
                careers_url=row.get("careers_url") or None,
            )
        )
        added += 1
    audit.record(db, actor.tenant_id, "target.imported", actor.actor_type, actor.actor_id, meta={"added": added})
    db.commit()
    return {"added": added, "skipped": skipped}


@targets_router.delete("/{target_id}", status_code=204)
def delete_target(target_id: uuid.UUID, actor: WriterDep, db: DbSession):
    target = db.scalar(sa.select(Target).where(Target.id == target_id, Target.tenant_id == actor.tenant_id))
    if not target:
        raise ApiError("not_found", "Target not found.", status_code=404)
    db.delete(target)
    db.commit()
