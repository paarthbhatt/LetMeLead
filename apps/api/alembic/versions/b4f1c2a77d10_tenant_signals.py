"""tenant signals: per-tenant catalog toggles

Revision ID: b4f1c2a77d10
Revises: eaba74131ae9
Create Date: 2026-11-11
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = 'b4f1c2a77d10'
down_revision: str | None = 'eaba74131ae9'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'tenant_signals',
        sa.Column('tenant_id', sa.Uuid(), nullable=False),
        sa.Column('signal_id', sa.String(length=64), nullable=False),
        sa.Column('enabled', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.CheckConstraint("signal_id <> ''", name='ck_tenant_signal_id'),
        sa.PrimaryKeyConstraint('tenant_id', 'signal_id'),
    )


def downgrade() -> None:
    op.drop_table('tenant_signals')
