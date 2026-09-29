from __future__ import annotations

import json
from datetime import datetime, timezone
from functools import cache
from typing import Any
from uuid import UUID

from sqlalchemy import Column, DateTime, LargeBinary, Text
from sqlmodel import Field, SQLModel, select

from langflow.services.deps import get_db_service, session_scope

from correlation_fixture_support import JOB_ID, contract_bytes

ADMISSION_OUTBOX_ID = UUID("00000000-0000-4000-8000-000000000016")


@cache
def _fake_native_admission_model() -> type[Any]:
    class FakeNativeAdmission(SQLModel, table=True):  # type: ignore[call-arg]
        __tablename__ = "trl668_fake_native_admissions"

        execution_id: str = Field(sa_column=Column(Text, primary_key=True))
        engine_job_id: UUID = Field(unique=True)
        publication_id: str = Field(sa_column=Column(Text, nullable=False))
        engine_epoch: int
        admission_receipt_bytes: bytes = Field(
            sa_column=Column(LargeBinary, nullable=False)
        )
        outbox_id: UUID = Field(unique=True)
        acknowledged_at: datetime | None = Field(
            default=None,
            sa_column=Column(DateTime(timezone=True), nullable=True),
        )

    return FakeNativeAdmission


async def create_failure_boundary_tables() -> None:
    from langflow.services.trellis_v1.correlation import TrellisJobCorrelation
    from langflow.services.trellis_v1.decisions import (
        TrellisDecisionAcceptance,
        TrellisDecisionEnqueueObligation,
    )
    fake_native_admission = _fake_native_admission_model()

    async with get_db_service().engine.begin() as connection:
        for table in (
            TrellisJobCorrelation.__table__,
            TrellisDecisionAcceptance.__table__,
            TrellisDecisionEnqueueObligation.__table__,
            fake_native_admission.__table__,
        ):
            await connection.run_sync(table.create, checkfirst=True)


async def commit_fake_native_admission() -> Any:
    fake_native_admission = _fake_native_admission_model()
    receipt_bytes = contract_bytes("admission")
    receipt = json.loads(receipt_bytes)
    async with session_scope() as session:
        row = await session.get(fake_native_admission, receipt["executionId"])
        if row is None:
            row = fake_native_admission(
                execution_id=receipt["executionId"],
                engine_job_id=JOB_ID,
                publication_id=receipt["publicationId"],
                engine_epoch=receipt["engineEpoch"],
                admission_receipt_bytes=receipt_bytes,
                outbox_id=ADMISSION_OUTBOX_ID,
            )
            session.add(row)
            await session.flush()
        elif (
            row.engine_job_id != JOB_ID
            or row.publication_id != receipt["publicationId"]
            or row.engine_epoch != receipt["engineEpoch"]
            or row.admission_receipt_bytes != receipt_bytes
            or row.outbox_id != ADMISSION_OUTBOX_ID
        ):
            raise RuntimeError("fake_native_admission_identity_conflict")
        return row


async def pending_fake_native_admissions() -> list[Any]:
    fake_native_admission = _fake_native_admission_model()
    async with session_scope() as session:
        statement = (
            select(fake_native_admission)
            .where(fake_native_admission.acknowledged_at.is_(None))
            .order_by(fake_native_admission.execution_id)
        )
        return list((await session.exec(statement)).all())


async def mark_fake_native_admission_acknowledged(
    *,
    execution_id: str,
    engine_job_id: UUID,
    admission_receipt_bytes: bytes,
) -> None:
    fake_native_admission = _fake_native_admission_model()
    async with session_scope() as session:
        row = await session.get(
            fake_native_admission,
            execution_id,
            with_for_update=True,
        )
        if row is None:
            raise RuntimeError("fake_native_admission_unknown")
        if (
            row.engine_job_id != engine_job_id
            or row.admission_receipt_bytes != admission_receipt_bytes
        ):
            raise RuntimeError("fake_native_admission_identity_conflict")
        if row.acknowledged_at is None:
            row.acknowledged_at = datetime.now(timezone.utc)
            session.add(row)
            await session.flush()
