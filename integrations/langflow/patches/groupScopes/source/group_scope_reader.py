from __future__ import annotations

import json
from typing import Annotated
from uuid import UUID

import sqlalchemy as sa
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlmodel import select

from langflow.services.database.models.jobs.model import Job, JobStatus
from langflow.services.deps import session_scope
from langflow.services.trellis_publications.contracts import PublicationRequest
from langflow.services.trellis_publications.ledger import publications
from langflow.services.trellis_v1.correlation import TrellisJobCorrelation
from langflow.services.trellis_v1.engine_api import EngineApiSecurity
from langflow.services.trellis_v1.native_records import checkpoint
from langflow.services.trellis_v1.occurrence_journal import JOURNAL_KIND, OccurrenceConflict
from langflow.services.trellis_v1.occurrence_models import VisitScope, digest


class GroupScopeReadInput(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    execution_id: str = Field(alias="executionId", min_length=1)
    publication_id: str = Field(alias="publicationId", min_length=1)
    engine_job_id: UUID = Field(alias="engineJobId")
    engine_epoch: int = Field(alias="engineEpoch")
    scope_vertex_id: str = Field(alias="scopeVertexId", min_length=1)
    occurrence_key: str = Field(alias="occurrenceKey", min_length=1)


class GroupScopeReadMissing(ValueError):
    pass


def _saved_control(journal: dict, occurrence_key: str) -> tuple[str, dict]:
    for key, control in journal.get("controls", {}).items():
        if control["occurrence"]["occurrenceKey"] == occurrence_key:
            return key, control
    raise GroupScopeReadMissing("group_scope_control_missing")


def _verify_group_entry(graph_checkpoint: dict, definition: dict, occurrence: dict, allocation_scope: dict) -> None:
    occurrence_key = occurrence["occurrenceKey"]
    entered_definition = graph_checkpoint["group_scope_definitions"].get(occurrence_key)
    entered_visit = graph_checkpoint["group_visit_scopes"].get(occurrence_key)
    if entered_definition != definition or entered_visit is None:
        raise OccurrenceConflict("group_scope_entry_conflict")
    entered_scope = entered_visit["scope"]
    if (entered_visit["occurrence"] != occurrence
            or entered_scope["parentOccurrenceKey"] != occurrence_key
            or entered_scope["phase"] != "children"
            or entered_scope["iterationPath"] != occurrence["iterationPath"]
            or entered_scope["inputReceiptIds"] != allocation_scope["inputReceiptIds"]
            or entered_scope["groupDeadlineRefs"][:len(allocation_scope["groupDeadlineRefs"])]
            != allocation_scope["groupDeadlineRefs"]):
        raise OccurrenceConflict("group_scope_entry_identity_conflict")


async def read_group_scope(session, input: GroupScopeReadInput) -> dict:
    job = (await session.exec(select(Job).where(Job.job_id == input.engine_job_id).with_for_update())).one_or_none()
    if job is None:
        raise GroupScopeReadMissing("group_scope_job_missing")
    if job.status not in {JobStatus.IN_PROGRESS, JobStatus.SUSPENDED, JobStatus.QUEUED}:
        raise OccurrenceConflict("group_scope_job_not_active")
    correlation = (await session.exec(select(TrellisJobCorrelation).where(
        TrellisJobCorrelation.engine_job_id == input.engine_job_id))).one_or_none()
    if correlation is None or correlation.admission_receipt_bytes is None:
        raise OccurrenceConflict("group_scope_admission_closed")
    admission = json.loads(correlation.admission_receipt_bytes)
    binding = {
        "executionId": input.execution_id,
        "publicationId": input.publication_id,
        "engineJobId": str(input.engine_job_id),
        "engineEpoch": input.engine_epoch,
    }
    if any(admission[field] != value for field, value in binding.items()):
        raise OccurrenceConflict("group_scope_binding_conflict")
    publication = (await session.execute(sa.select(publications).where(
        publications.c.engine_flow_id == job.flow_id))).one_or_none()
    if publication is None or publication.receipt["publicationId"] != input.publication_id:
        raise OccurrenceConflict("group_scope_publication_conflict")
    document = PublicationRequest.model_validate_json(publication.request_bytes)
    document.source()
    node = next((item for item in document.snapshot["graphDocument"]["nodes"]
                 if item["id"] == input.scope_vertex_id), None)
    if node is None:
        raise GroupScopeReadMissing("group_scope_vertex_missing")
    if node["data"]["type"] != "TrellisGroupScopeV1":
        raise OccurrenceConflict("group_scope_component_type_conflict")
    raw_definition = node["data"]["node"]["template"]["scope_definition"]["value"]
    definition = json.loads(raw_definition)
    stored = await checkpoint(session, input.engine_job_id, JOURNAL_KIND)
    if stored is None:
        raise GroupScopeReadMissing("group_scope_journal_missing")
    journal = json.loads(stored.blob)
    control_key, control = _saved_control(journal, input.occurrence_key)
    occurrence = control["occurrence"]
    if occurrence["nodeId"] != definition["groupNodeId"]:
        raise OccurrenceConflict("group_scope_source_node_conflict")
    scope_value = {
        "parentOccurrenceKey": occurrence["parentOccurrenceKey"],
        "phase": occurrence["phase"],
        "iterationPath": occurrence["iterationPath"],
        **control["facts"]["scope"],
    }
    scope = VisitScope.from_engine(scope_value)
    if scope.identity(input.scope_vertex_id) != control_key:
        raise OccurrenceConflict("group_scope_control_identity_conflict")
    if control["facts"]["definitionHash"] != digest(raw_definition):
        raise OccurrenceConflict("group_scope_definition_conflict")
    graph_state = await checkpoint(session, input.engine_job_id, "graph")
    if graph_state is None:
        raise GroupScopeReadMissing("group_scope_entry_missing")
    graph_checkpoint = json.loads(graph_state.blob)
    _verify_group_entry(graph_checkpoint, definition, occurrence, scope_value)
    return {
        **binding,
        "scopeVertexId": input.scope_vertex_id,
        "occurrence": occurrence,
        "scope": scope.to_engine(),
        "groupDefinition": definition,
    }


def create_group_scope_router(*, security: EngineApiSecurity, open_session=session_scope) -> APIRouter:
    router = APIRouter(prefix="/group-scopes")

    @router.post("/read")
    async def read(
        input: GroupScopeReadInput,
        authorization: Annotated[str | None, Header()] = None,
    ) -> dict:
        await security.require_transport_auth(authorization)
        try:
            async with open_session() as session:
                return await read_group_scope(session, input)
        except GroupScopeReadMissing as error:
            raise HTTPException(status_code=404, detail=str(error)) from error
        except OccurrenceConflict as error:
            raise HTTPException(status_code=409, detail=str(error)) from error

    return router
