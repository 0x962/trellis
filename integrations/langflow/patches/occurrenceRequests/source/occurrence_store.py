from __future__ import annotations

import json
from datetime import datetime, timezone
from uuid import UUID

import sqlalchemy as sa
from sqlmodel import select

from langflow.services.database.models.jobs.model import Job, JobStatus
from langflow.services.trellis_publications.contracts import PublicationRequest
from langflow.services.trellis_publications.ledger import publications
from langflow.services.trellis_v1.authority import read_authority, require_authority
from langflow.services.trellis_v1.correlation import TrellisJobCorrelation
from langflow.services.trellis_v1.native_records import add_checkpoint, checkpoint

from .occurrence_journal import JOURNAL_KIND, OccurrenceConflict
from .occurrence_models import canonical


async def locked_context(session, graph, vertex_id: str):
    job_id = UUID(str(graph.job_id))
    graph.get_vertex(vertex_id)
    job = (await session.exec(select(Job).where(Job.job_id == job_id).with_for_update())).one()
    if job.status not in {JobStatus.IN_PROGRESS, JobStatus.SUSPENDED, JobStatus.QUEUED}:
        raise OccurrenceConflict("occurrence_job_not_active")
    correlation = (await session.exec(select(TrellisJobCorrelation).where(
        TrellisJobCorrelation.engine_job_id == job_id))).one()
    if correlation.admission_receipt_bytes is None:
        raise OccurrenceConflict("occurrence_admission_closed")
    admission = json.loads(correlation.admission_receipt_bytes)
    publication = (await session.execute(sa.select(publications).where(
        publications.c.engine_flow_id == job.flow_id))).one()
    document = PublicationRequest.model_validate_json(publication.request_bytes)
    document.source()
    if (publication.receipt["publicationId"] != admission["publicationId"]
            or correlation.execution_id != admission["executionId"]
            or admission["engineJobId"] != str(job_id)):
        raise OccurrenceConflict("occurrence_publication_conflict")
    spec = document.snapshot["graphDocument"]["trellisRequestSpecsV1"][vertex_id]
    stored = await checkpoint(session, job_id, JOURNAL_KIND)
    journal = {"revision": 0, "visits": {}} if stored is None else json.loads(stored.blob)
    return job_id, admission, spec, journal


async def authorize_native(session, job_id, admission) -> str:
    state = await read_authority(session, admission["executionId"])
    if state is None or state.binding is None:
        raise OccurrenceConflict("occurrence_authority_absent")
    binding = await require_authority(
        session, state.binding.authority_bytes, "native.reserve",
        execution_id=admission["executionId"], publication_id=admission["publicationId"], engine_job_id=job_id,
    )
    return binding.authority.capability_id


async def save_journal(session, job_id, journal) -> None:
    await save_blob(session, job_id, JOURNAL_KIND, canonical(journal))


async def save_blob(session, job_id, kind: str, blob: str) -> None:
    prior = await checkpoint(session, job_id, kind)
    if prior is None:
        add_checkpoint(session, job_id, kind, blob)
    else:
        prior.blob = blob
        prior.updated_at = datetime.now(timezone.utc)
        session.add(prior)
    await session.flush()


async def save_wait(session, job_id, graph, wait_bytes: str, *, replacing: str | None = None) -> dict:
    snapshot = graph.build_checkpoint()
    waits = dict(snapshot.external_waits)
    if replacing is not None:
        old_id = json.loads(replacing)["waitId"]
        if waits.get(old_id) != replacing:
            raise OccurrenceConflict("occurrence_wait_replacement_conflict")
        del waits[old_id]
    wait_id = json.loads(wait_bytes)["waitId"]
    if wait_id in waits and waits[wait_id] != wait_bytes:
        raise OccurrenceConflict("occurrence_wait_bytes_conflict")
    waits[wait_id] = wait_bytes
    snapshot.external_waits = waits
    await save_blob(session, job_id, "graph", snapshot.model_dump_json())
    return waits
