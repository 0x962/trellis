from __future__ import annotations

import json
from datetime import datetime, timezone
from uuid import UUID

from langflow.services.deps import session_scope
from langflow.services.trellis_v1.native_records import checkpoint
from langflow.services.trellis_v1.occurrence_journal import JOURNAL_KIND, OccurrenceConflict
from langflow.services.trellis_v1.occurrence_models import canonical
from langflow.services.trellis_v1.occurrence_projection import finish_projection
from langflow.services.trellis_v1.occurrence_store import locked_graph, save_blob, save_graph, save_journal
from langflow.services.trellis_v1.projection_store import record_projection_checkpoint
from langflow.services.trellis_v1.review_gate_projection import read_review_projection


TERMINAL_STATES = {"succeeded", "failed", "canceled", "skipped"}


def _finish_review_projection(visit, state, *, error, skip_reason, observed_at):
    projection = read_review_projection(visit)
    if projection["state"] in TERMINAL_STATES:
        return
    projection.update(state=state, endedAt=observed_at, error=error, skipReason=skip_reason)
    visit["projection"] = projection


def _active_visits(journal, vertex_id):
    active = []
    for visit in journal.get("visits", {}).values():
        if visit["vertexId"] == vertex_id and visit["projection"]["state"] not in TERMINAL_STATES:
            active.append((visit, False))
    for visit in journal.get("reviewVisits", {}).values():
        projection = read_review_projection(visit)
        if visit["vertexId"] == vertex_id and projection["state"] not in TERMINAL_STATES:
            active.append((visit, True))
    return active


async def record_vertex_terminal(graph, vertex_id, *, state, error=None, skip_reason=None):
    observed_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    async with graph._external_wait_lock:
        async with session_scope() as session:
            job_id = UUID(str(graph.job_id))
            if await checkpoint(session, job_id, JOURNAL_KIND) is None:
                return
            job_id, _admission, _document, journal = await locked_graph(session, graph)
            visits = _active_visits(journal, vertex_id)
            if not visits:
                return
            if len(visits) != 1:
                raise OccurrenceConflict("vertex_projection_occurrence_conflict")
            visit, review = visits[0]
            if review:
                _finish_review_projection(
                    visit,
                    state,
                    error=error,
                    skip_reason=skip_reason,
                    observed_at=observed_at,
                )
            else:
                finish_projection(
                    visit,
                    state,
                    error=error,
                    skip_reason=skip_reason,
                    observed_at=observed_at,
                )
            await save_journal(session, job_id, journal)
            await save_graph(session, job_id, graph)
            await record_projection_checkpoint(session, job_id)
            await session.commit()


async def terminalize_active_visits(session, job_id, *, state, error=None):
    row = await checkpoint(session, job_id, JOURNAL_KIND)
    if row is None:
        return
    journal = json.loads(row.blob)
    observed_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    changed = False
    for visit in journal.get("visits", {}).values():
        if visit["projection"]["state"] in TERMINAL_STATES:
            continue
        finish_projection(visit, state, error=error, observed_at=observed_at)
        changed = True
    for visit in journal.get("reviewVisits", {}).values():
        projection = read_review_projection(visit)
        if projection["state"] in TERMINAL_STATES:
            continue
        _finish_review_projection(visit, state, error=error, skip_reason=None, observed_at=observed_at)
        changed = True
    if changed:
        await save_blob(session, job_id, JOURNAL_KIND, canonical(journal))
