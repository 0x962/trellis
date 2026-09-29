from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from uuid import UUID, uuid4

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from structlog.contextvars import bound_contextvars

from langflow.services.database.models.jobs.model import (
    ExecutionSignal,
    Job,
    JobCheckpoint,
    JobStatus,
    JobType,
    SignalType,
)
from langflow.services.trellis_v1.cancellation_models import (
    CancellationConflict,
    CancellationInput,
    CancellationMissing,
    CancellationReceipt,
    CancellationRecord,
)
from langflow.services.trellis_v1.correlation import TrellisJobCorrelation
from langflow.services.trellis_v1.engine_api import EngineApiSecurity

CANCELLATION_KIND = "trellis-cancellation-v1"
logger = structlog.get_logger(__name__)


async def read_cancellation(session: AsyncSession, job_id: UUID) -> CancellationRecord | None:
    result = await session.execute(
        select(JobCheckpoint).where(JobCheckpoint.job_id == job_id, JobCheckpoint.kind == CANCELLATION_KIND)
    )
    checkpoint = result.scalar_one_or_none()
    if checkpoint is None:
        return None
    record = CancellationRecord.model_validate_json(checkpoint.blob)
    with bound_contextvars(**record.structlog_log_context()):
        logger.debug("engine_cancellation_receipt_read")
    return record


async def assert_not_cancelled(session: AsyncSession, job_id: UUID) -> None:
    """The caller holds the Job lock until its continuation or completion write commits."""
    if await read_cancellation(session, job_id) is not None:
        raise CancellationConflict("execution_cancelled")


async def accept_cancellation(
    session: AsyncSession,
    security: EngineApiSecurity,
    input: CancellationInput,
) -> CancellationReceipt:
    result = await session.execute(select(Job).where(Job.job_id == input.engine_job_id).with_for_update())
    job = result.scalar_one_or_none()
    if job is None or job.type != JobType.WORKFLOW:
        raise CancellationMissing("cancellation_job_not_found")
    binding = await security.require_authority(
        session,
        input.authority_bytes.encode(),
        "execution.cancel",
        execution_id=input.execution_id,
        publication_id=input.publication_id,
        engine_job_id=input.engine_job_id,
    )
    result = await session.execute(
        select(TrellisJobCorrelation).where(TrellisJobCorrelation.engine_job_id == input.engine_job_id)
    )
    correlation = result.scalar_one_or_none()
    if (
        correlation is None
        or correlation.execution_id != input.execution_id
        or correlation.host_id != binding.authority.host_id
        or binding.authority.host_id != security.identity.host_id
    ):
        raise CancellationConflict("cancellation_correlation_conflict")
    saved = await read_cancellation(session, input.engine_job_id)
    request_bytes = input.request_bytes()
    if saved is not None:
        if saved.request_bytes != request_bytes:
            raise CancellationConflict("cancellation_identity_conflict")
        return saved.receipt
    now = datetime.now(timezone.utc)
    receipt = CancellationReceipt(
        version=1,
        receipt_id=uuid4(),
        request_id=input.request_id,
        execution_id=input.execution_id,
        engine_job_id=input.engine_job_id,
        cancel_intent_digest=hashlib.sha256(input.cancel_intent_bytes.encode()).hexdigest(),
        accepted_at=now,
    )
    record = CancellationRecord(request_bytes=request_bytes, receipt=receipt)
    session.add(JobCheckpoint(
        job_id=input.engine_job_id,
        kind=CANCELLATION_KIND,
        blob=record.model_dump_json(by_alias=True),
        created_at=now,
        updated_at=now,
    ))
    session.add(ExecutionSignal(
        id=receipt.receipt_id,
        job_id=input.engine_job_id,
        signal_type=SignalType.STOP,
        data={"trellisCancellationReceiptId": str(receipt.receipt_id)},
        created_at=now,
        consumed_at=(
            now
            if job.status in {JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED, JobStatus.TIMED_OUT}
            else None
        ),
    ))
    await session.flush()
    with bound_contextvars(**receipt.structlog_log_context()):
        logger.debug("engine_cancellation_receipt_prepared")
    return receipt
