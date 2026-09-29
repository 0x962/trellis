from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import httpx
from pydantic import BaseModel, ConfigDict, Field

from langflow.services.deps import session_scope

from .occurrence_models import canonical
from .occurrence_store import authorize_native, locked_graph, save_graph


class DeadlineModel(BaseModel):
    model_config = ConfigDict(alias_generator=lambda value: "".join(
        [value.split("_")[0], *[part.title() for part in value.split("_")[1:]]]
    ), populate_by_name=True, extra="forbid", frozen=True)


class GroupDeadline(DeadlineModel):
    deadline_id: str = Field(min_length=1)
    group_occurrence_key: str = Field(min_length=1)
    budget_ms: int = Field(gt=0)
    launched_at: str | None
    deadline_at: str | None
    launch_receipt_id: str | None


class GroupDeadlineResult(DeadlineModel):
    deadline: GroupDeadline
    group_deadline_refs: tuple[str, ...]
    deadline_at: str | None


@dataclass(frozen=True)
class GroupDeadlineTransport:
    origin: str
    authentication_file: Path

    async def reserve(self, request_bytes: str, capability_id: str) -> GroupDeadlineResult:
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.authentication_file.read_bytes().decode('utf-8')}",
            "X-Trellis-Capability-Id": capability_id,
        }
        async with httpx.AsyncClient(trust_env=False, follow_redirects=False, timeout=None) as client:
            response = await client.post(
                f"{self.origin.rstrip('/')}/api/langflow-private/v1/group-deadlines",
                content=request_bytes.encode("utf-8"),
                headers=headers,
            )
            response.raise_for_status()
            return GroupDeadlineResult.model_validate_json(response.content)


_transport: GroupDeadlineTransport | None = None


def install_group_deadline_transport(*, origin: str, authentication_file: Path) -> None:
    global _transport
    _transport = GroupDeadlineTransport(origin, authentication_file)


def group_deadline_transport() -> GroupDeadlineTransport:
    if _transport is None:
        raise RuntimeError("group_deadline_transport_not_installed")
    return _transport


async def reserve_group_deadline(graph, vertex_id: str, occurrence: dict) -> GroupDeadlineResult:
    async with graph._external_wait_lock:
        async with session_scope() as session:
            job_id, admission, _, _ = await locked_graph(session, graph)
            capability_id = await authorize_native(session, job_id, admission)
            await save_graph(session, job_id, graph)
            await session.commit()
    request = {
        **{field: admission[field] for field in ("executionId", "publicationId", "engineJobId", "engineEpoch")},
        "scopeVertexId": vertex_id,
        "occurrenceKey": occurrence["occurrenceKey"],
    }
    result = await group_deadline_transport().reserve(canonical(request), capability_id)
    if result.deadline.group_occurrence_key != occurrence["occurrenceKey"]:
        raise ValueError("group_deadline_occurrence_conflict")
    if not result.group_deadline_refs or result.group_deadline_refs[-1] != result.deadline.deadline_id:
        raise ValueError("group_deadline_reference_conflict")
    return result
