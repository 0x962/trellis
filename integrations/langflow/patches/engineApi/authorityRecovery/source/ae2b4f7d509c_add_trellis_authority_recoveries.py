"""Add exact-byte records for initial authority recovery.

Revision ID: ae2b4f7d509c
Revises: 9d1a3e6c4f8b
Create Date: 2026-09-29

Phase: EXPAND
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "ae2b4f7d509c"  # pragma: allowlist secret
down_revision: str | None = "9d1a3e6c4f8b"  # pragma: allowlist secret
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    from langflow.utils import migration

    conn = op.get_bind()
    if migration.table_exists("trellis_authority_recoveries", conn):
        return
    op.create_table(
        "trellis_authority_recoveries",
        sa.Column("request_id", sa.Uuid(), nullable=False),
        sa.Column("execution_id", sa.Text(), nullable=False),
        sa.Column("engine_job_id", sa.Uuid(), nullable=False),
        sa.Column("request_bytes", sa.LargeBinary(), nullable=False),
        sa.Column("request_digest", sa.Text(), nullable=False),
        sa.Column("original_authority_bytes", sa.LargeBinary(), nullable=False),
        sa.Column("original_authority_digest", sa.Text(), nullable=False),
        sa.Column("initial_record_bytes", sa.LargeBinary(), nullable=False),
        sa.Column("successor_commit_bytes", sa.LargeBinary(), nullable=False),
        sa.Column("successor_authority_bytes", sa.LargeBinary(), nullable=False),
        sa.Column("successor_authority_digest", sa.Text(), nullable=False),
        sa.Column("response_bytes", sa.LargeBinary(), nullable=False),
        sa.PrimaryKeyConstraint("request_id", name="pk_trellis_authority_recoveries"),
        sa.UniqueConstraint("execution_id", name="uq_trellis_authority_recoveries_execution_id"),
        sa.UniqueConstraint("engine_job_id", name="uq_trellis_authority_recoveries_engine_job_id"),
    )


def downgrade() -> None:
    from langflow.utils import migration

    conn = op.get_bind()
    if migration.table_exists("trellis_authority_recoveries", conn):
        op.drop_table("trellis_authority_recoveries")
