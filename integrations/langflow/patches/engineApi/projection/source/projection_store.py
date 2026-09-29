from __future__ import annotations

import json
from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlmodel import select

from langflow.services.database.models.jobs.model import Job
from langflow.services.trellis_v1.authority import TrellisDeliveryAuthority, read_authority
from langflow.services.trellis_v1.correlation import TrellisJobCorrelation
from langflow.services.trellis_v1.native_records import add_checkpoint, checkpoint
from langflow.services.trellis_v1.occurrence_models import canonical, digest
from langflow.services.trellis_v1.review_gate_history import read_review_history

LATEST_KIND = "trellis-projection-latest-v1"
OUTCOME_KIND = "trellis-projection-outcome-v1"


def snapshot_kind(sequence: int) -> str:
    return f"trellis-projection-snapshot-v1:{sequence}"


async def save_blob(session, job_id, kind: str, blob: str) -> None:
    prior = await checkpoint(session, job_id, kind)
    if prior is None:
        add_checkpoint(session, job_id, kind, blob)
    else:
        prior.blob = blob
        prior.updated_at = datetime.now(timezone.utc)
        session.add(prior)
    await session.flush()


async def record_projection_checkpoint(session, job_id: UUID) -> dict:
    await session.flush()
    job = (await session.exec(select(Job).where(Job.job_id == job_id).with_for_update())).one()
    correlation = (await session.exec(select(TrellisJobCorrelation).where(
        TrellisJobCorrelation.engine_job_id == job_id))).one()
    admission = json.loads(correlation.admission_receipt_bytes)
    (await session.exec(select(TrellisDeliveryAuthority).where(
        TrellisDeliveryAuthority.execution_id == correlation.execution_id,
    ).with_for_update())).one()
    owner = await read_authority(session, correlation.execution_id)
    if owner is None:
        raise ValueError("projection_authority_missing")
    authority = owner.binding.authority
    binding = {
        "executionId": correlation.execution_id,
        "publicationId": admission["publicationId"],
        "engineJobId": str(job_id),
        "engineEpoch": authority.engine_epoch,
    }
    if (authority.execution_id != binding["executionId"]
            or authority.publication_id != binding["publicationId"]
            or str(authority.engine_job_id) != binding["engineJobId"]):
        raise ValueError("projection_binding_conflict")
    graph = await checkpoint(session, job_id, "graph")
    if graph is None:
        raise ValueError("projection_graph_missing")
    journal = await checkpoint(session, job_id, "trellis-occurrences-v1")
    outcome = await checkpoint(session, job_id, OUTCOME_KIND)
    await read_review_history(session, job_id)
    content = {
        **binding,
        "graphCheckpointBytes": graph.blob,
        "occurrenceJournalBytes": None if journal is None else journal.blob,
        "jobStatus": job.status.value,
        "jobOutcomeBytes": None if outcome is None else outcome.blob,
    }
    content_digest = digest(canonical(content))
    previous = await checkpoint(session, job_id, LATEST_KIND)
    retained = None if previous is None else json.loads(previous.blob)
    if retained is not None and retained["contentDigest"] == content_digest:
        return retained
    sequence = 1 if retained is None else retained["sourceCursor"] + 1
    receipt_id = str(uuid4())
    captured_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    waits = json.loads(graph.blob)["external_waits"]
    envelope = {
        "version": 1, **binding, "checkpointId": receipt_id, "revision": sequence,
        "continuationRef": str(graph.id),
        "waits": [json.loads(value) for value in waits.values()],
    }
    snapshot = {
        "version": 1, **content, "sourceCursor": sequence, "capturedAt": captured_at,
        "checkpointBytes": canonical(envelope),
    }
    event = {
        "version": 1, **binding, "sourceEventId": receipt_id, "occurredAt": captured_at,
        "occurrence": None, "payload": {"kind": "checkpoint_saved", "receiptId": receipt_id},
    }
    record = {
        "sourceCursor": sequence, "snapshotBytes": canonical(snapshot),
        "sourceBytes": canonical(event), "contentDigest": content_digest,
    }
    record["snapshotDigest"] = digest(record["snapshotBytes"])
    record["sourceDigest"] = digest(record["sourceBytes"])
    await save_blob(session, job_id, snapshot_kind(sequence), canonical(record))
    await save_blob(session, job_id, LATEST_KIND, canonical(record))
    return record
