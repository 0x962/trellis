from __future__ import annotations

import json

from sqlmodel import select

from langflow.services.database.models.jobs.model import JobStatus
from langflow.services.trellis_v1.authority import read_authority
from langflow.services.trellis_v1.container_projection import terminalize_container_history
from langflow.services.trellis_v1.correlation import TrellisJobCorrelation
from langflow.services.trellis_v1.native_records import checkpoint
from langflow.services.trellis_v1.occurrence_models import canonical
from langflow.services.trellis_v1.occurrence_store import save_blob
from langflow.services.trellis_v1.projection_store import OUTCOME_KIND, record_projection_checkpoint
from langflow.services.trellis_v1.vertex_projection import terminalize_active_visits


STATUS = {
    JobStatus.COMPLETED: "succeeded",
    JobStatus.FAILED: "failed",
    JobStatus.TIMED_OUT: "failed",
    JobStatus.CANCELLED: "canceled",
}


async def save_terminal_projection(session, job, *, failure):
    correlation = (await session.exec(select(TrellisJobCorrelation).where(
        TrellisJobCorrelation.engine_job_id == job.job_id))).first()
    if correlation is None or correlation.admission_receipt_bytes is None:
        return
    admission = json.loads(correlation.admission_receipt_bytes)
    owner = await read_authority(session, correlation.execution_id)
    if owner is None or owner.binding is None:
        raise ValueError("projection_authority_missing")
    authority = owner.binding.authority
    outcome = {
        "version": 1,
        "executionId": correlation.execution_id,
        "publicationId": admission["publicationId"],
        "engineJobId": str(job.job_id),
        "engineEpoch": authority.engine_epoch,
        "status": STATUS[job.status],
        "failure": failure,
    }
    outcome_bytes = canonical(outcome)
    retained = await checkpoint(session, job.job_id, OUTCOME_KIND)
    if retained is not None and retained.blob != outcome_bytes:
        raise ValueError("projection_outcome_conflict")
    if retained is None:
        await save_blob(session, job.job_id, OUTCOME_KIND, outcome_bytes)
    if job.status in {JobStatus.FAILED, JobStatus.TIMED_OUT}:
        await terminalize_active_visits(session, job.job_id, state="failed", error=failure["reason"])
        await terminalize_container_history(session, job.job_id, state="failed", error=failure["reason"])
    elif job.status == JobStatus.CANCELLED:
        await terminalize_active_visits(session, job.job_id, state="canceled")
        await terminalize_container_history(session, job.job_id, state="canceled")
    await record_projection_checkpoint(session, job.job_id)
