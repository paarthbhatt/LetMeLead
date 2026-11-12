"""Reopen claimed demo leads so the browser journey can claim one every run.

The journey tests run against the seeded demo workspace (`scripts/seed.py`).
Each run claims a lead, so this puts claimed leads back to `new` while leaving
their evidence, campaigns and credit ledger untouched.

Run with: make e2e   (or `python scripts/seed_e2e.py` before `npx playwright test`)
"""

from __future__ import annotations

import sys
from pathlib import Path

API_DIR = Path(__file__).resolve().parents[1] / "apps" / "api"
sys.path.insert(0, str(API_DIR))

from letmelead.db import SessionLocal  # noqa: E402
from letmelead.models import Lead, Tenant  # noqa: E402
from sqlalchemy import func, select, update  # noqa: E402


def _reset() -> None:
    with SessionLocal() as db:
        tenant = db.scalar(select(Tenant).where(Tenant.slug == "demo-workspace"))
        if tenant is None:
            raise SystemExit("demo workspace missing: run `python scripts/seed.py` first")

        reopened = db.execute(
            update(Lead)
            .where(Lead.tenant_id == tenant.id, Lead.status == "claimed")
            .values(status="new", claimed_at=None, claimed_by=None)
        )
        db.commit()

        claimable = db.scalar(
            select(func.count())
            .select_from(Lead)
            .where(
                Lead.tenant_id == tenant.id,
                Lead.status == "new",
                Lead.fit != "not_fit",
            )
        )
    print(f"e2e fixture: reopened {reopened.rowcount} claimed leads, {claimable} claimable")
    if not claimable:
        raise SystemExit("no claimable leads: run `python scripts/seed.py` first")


if __name__ == "__main__":
    _reset()
