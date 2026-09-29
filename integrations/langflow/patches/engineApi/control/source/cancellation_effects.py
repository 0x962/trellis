from __future__ import annotations

from uuid import UUID

import structlog
from sqlalchemy import select
from structlog.contextvars import bound_contextvars

from langflow.services.background_execution.service import BackgroundExecutionService
from langflow.services.database.models.jobs.model import Job, JobCheckpoint, JobStatus
from langflow.services.database.models.user.model import User, UserRead
from langflow.services.trellis_v1.cancellation import CANCELLATION_KIND, accept_cancellation, read_cancellation
from langflow.services.trellis_v1.cancellation_models import CancellationInput, CancellationMissing, CancellationReceipt
from langflow.services.trellis_v1.engine_api import AuthoritySession, EngineApiSecurity

TERMINAL = {JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED, JobStatus.TIMED_OUT}
logger = structlog.get_logger(__name__)


async def cancel_execution(
    sessions: AuthoritySession,
    background: BackgroundExecutionService,
    security: EngineApiSecurity,
    input: CancellationInput,
) -> tuple[CancellationReceipt, JobStatus]:
    with bound_contextvars(**input.structlog_log_context()):
        async with sessions() as session:
            receipt = await accept_cancellation(session, security, input)
            await session.commit()
        with bound_contextvars(**receipt.structlog_log_context()):
            logger.info("engine_cancellation_committed")
            status = await drain_cancellation(sessions, background, input.engine_job_id)
        return receipt, status


async def drain_cancellation(
    sessions: AuthoritySession,
    background: BackgroundExecutionService,
    job_id: UUID,
) -> JobStatus:
    async with sessions() as session:
        record = await read_cancellation(session, job_id)
        if record is None:
            raise CancellationMissing("cancellation_receipt_not_found")
    with bound_contextvars(**record.structlog_log_context()):
        return await _drain_cancellation(sessions, background, job_id)


async def _drain_cancellation(
    sessions: AuthoritySession,
    background: BackgroundExecutionService,
    job_id: UUID,
) -> JobStatus:
    async with sessions() as session:
        job = await session.get(Job, job_id)
        if job is None:
            raise CancellationMissing("cancellation_job_not_found")
        if job.status in TERMINAL:
            logger.info("engine_cancellation_status_observed", engine_status=job.status.value)
            return job.status
        user = await session.get(User, job.user_id)
        if user is None:
            raise CancellationMissing("cancellation_owner_not_found")
        owner = UserRead.model_validate(user, from_attributes=True)
    logger.info("engine_cancellation_stop_requested")
    try:
        await background.stop_job(job_id, owner)
    except Exception as error:
        logger.error("engine_cancellation_stop_failed", error_type=type(error).__name__)
        raise
    async with sessions() as session:
        job = await session.get(Job, job_id)
        if job is None:
            raise CancellationMissing("cancellation_job_not_found")
        logger.info("engine_cancellation_status_observed", engine_status=job.status.value)
        return job.status


async def replay_cancellations(
    sessions: AuthoritySession,
    background: BackgroundExecutionService,
) -> None:
    """Replay committed stop effects before the host admits new graph work."""
    async with sessions() as session:
        result = await session.execute(
            select(JobCheckpoint.job_id).where(JobCheckpoint.kind == CANCELLATION_KIND).order_by(JobCheckpoint.job_id)
        )
        job_ids = list(result.scalars())
    for job_id in job_ids:
        await drain_cancellation(sessions, background, job_id)
