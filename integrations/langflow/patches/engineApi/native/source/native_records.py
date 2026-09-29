from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlmodel import select

from langflow.services.database.models.jobs.model import JobCheckpoint
from langflow.services.trellis_v1.native_protocol import digest, read_json


def acceptance_kind(wait_id: str) -> str:
    return f"trellis-native-acceptance-v1:{digest(wait_id)}"


def request_kind(wait_id: str) -> str:
    return f"trellis-native-request-v1:{digest(wait_id)}"


async def checkpoint(session, job_id: UUID, kind: str) -> JobCheckpoint | None:
    return (await session.exec(select(JobCheckpoint).where(
        JobCheckpoint.job_id == job_id, JobCheckpoint.kind == kind,
    ))).first()


def add_checkpoint(session, job_id: UUID, kind: str, blob: str) -> None:
    now = datetime.now(timezone.utc)
    session.add(JobCheckpoint(id=uuid4(), job_id=job_id, kind=kind, blob=blob, created_at=now, updated_at=now))


async def saved_wait(session, job_id: UUID, wait_id: str) -> str | None:
    graph = await checkpoint(session, job_id, "graph")
    if graph is None:
        return None
    return read_json(graph.blob).get("external_waits", {}).get(wait_id)
