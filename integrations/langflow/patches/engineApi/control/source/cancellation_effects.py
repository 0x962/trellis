from __future__ import annotations

from uuid import UUID

from sqlalchemy import select

from langflow.services.background_execution.service import BackgroundExecutionService
from langflow.services.database.models.jobs.model import Job, JobCheckpoint, JobStatus
from langflow.services.database.models.user.model import User, UserRead
from langflow.services.trellis_v1.cancellation import CANCELLATION_KIND, read_cancellation
from langflow.services.trellis_v1.cancellation_models import CancellationMissing
from langflow.services.trellis_v1.engine_api import AuthoritySession

TERMINAL = {JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED, JobStatus.TIMED_OUT}


async def drain_cancellation(
    sessions: AuthoritySession,
    background: BackgroundExecutionService,
    job_id: UUID,
) -> JobStatus:
    async with sessions() as session:
        record = await read_cancellation(session, job_id)
        if record is None:
            raise CancellationMissing("cancellation_receipt_not_found")
        job = await session.get(Job, job_id)
        if job is None:
            raise CancellationMissing("cancellation_job_not_found")
        if job.status in TERMINAL:
            return job.status
        user = await session.get(User, job.user_id)
        if user is None:
            raise CancellationMissing("cancellation_owner_not_found")
        owner = UserRead.model_validate(user, from_attributes=True)
    await background.stop_job(job_id, owner)
    async with sessions() as session:
        job = await session.get(Job, job_id)
        if job is None:
            raise CancellationMissing("cancellation_job_not_found")
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
