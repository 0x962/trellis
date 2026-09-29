"""Add current Trellis delivery authorities.

Revision ID: 9d1a3e6c4f8b
Revises: 8c0f2d5b3e7a
Create Date: 2026-09-29

Phase: EXPAND
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "9d1a3e6c4f8b"  # pragma: allowlist secret
down_revision: str | None = "8c0f2d5b3e7a"  # pragma: allowlist secret
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    from langflow.utils import migration

    conn = op.get_bind()
    if migration.table_exists("trellis_delivery_authorities", conn):
        return
    op.create_table(
        "trellis_delivery_authorities",
        sa.Column("execution_id", sa.Text(), nullable=False),
        sa.Column("authority_bytes", sa.LargeBinary(), nullable=False),
        sa.Column("authority_digest", sa.Text(), nullable=False),
        sa.Column("publication_id", sa.Text(), nullable=False),
        sa.Column("engine_job_id", sa.Uuid(), nullable=False),
        sa.Column("engine_epoch", sa.Integer(), nullable=False),
        sa.Column("host_id", sa.Text(), nullable=False),
        sa.Column("owner_id", sa.Text(), nullable=False),
        sa.Column("ownership_revision", sa.Integer(), nullable=False),
        sa.Column("capability_id", sa.Text(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("execution_id", name="pk_trellis_delivery_authorities"),
        sa.UniqueConstraint("engine_job_id", name="uq_trellis_delivery_authorities_engine_job_id"),
        sa.UniqueConstraint("capability_id", name="uq_trellis_delivery_authorities_capability_id"),
    )


def downgrade() -> None:
    from langflow.utils import migration

    conn = op.get_bind()
    if migration.table_exists("trellis_delivery_authorities", conn):
        op.drop_table("trellis_delivery_authorities")
