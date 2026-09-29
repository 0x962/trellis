import json
from types import SimpleNamespace
from uuid import UUID

import pytest

from langflow.services.trellis_v1 import review_gate_history as history
from langflow.services.trellis_v1.occurrence_journal import OccurrenceConflict
from langflow.services.trellis_v1.occurrence_models import canonical, digest
from langflow.services.trellis_v1.review_gate_projection import (
    accept_review_projection,
    pending_review_projection,
    read_review_projection,
    start_review_projection,
)

START = "2026-09-29T22:00:00Z"
LATER = "2026-09-29T22:01:00Z"


def test_acceptance_preserves_running_state_and_unknown_end():
    visit = {"acceptedResultId": None, "projection": pending_review_projection()}
    assert visit["projection"]["state"] == "pending"
    assert visit["projection"]["startedAt"] is None
    start_review_projection(visit, START)
    accept_review_projection(visit, "classification")
    start_review_projection(visit, LATER)
    assert visit["projection"] == {"state": "running", "acceptedResultId": "classification",
        "startedAt": START, "endedAt": None, "error": None, "skipReason": None}
    assert visit["acceptedResultId"] == "classification"
    with pytest.raises(OccurrenceConflict, match="receipt_conflict"):
        accept_review_projection(visit, "other")


def test_historical_acceptance_does_not_create_times_or_success():
    visit = {"acceptedResultId": "classification"}
    assert read_review_projection(visit) == {"state": "unknown", "acceptedResultId": "classification",
        "startedAt": None, "endedAt": None, "error": None, "skipReason": None}
    start_review_projection(visit, LATER)
    assert visit["projection"]["startedAt"] is None
    assert visit["projection"]["state"] == "running"
    visit["projection"]["acceptedResultId"] = "other"
    with pytest.raises(OccurrenceConflict, match="receipt_conflict"):
        read_review_projection(visit)


@pytest.mark.asyncio
@pytest.mark.parametrize("classification_state", ["succeeded", "failed"])
async def test_history_uses_vertex_facts_after_consumed_wait(monkeypatch, classification_state):
    job_id = UUID("00000000-0000-4000-8000-000000000001")
    shared = '{"classification":"shared"}'
    request = {"version": 1, "executionId": "execution", "publicationId": "publication",
        "engineJobId": str(job_id), "engineEpoch": 1, "nodeId": "front", "occurrenceKey": "occurrence",
        "parentOccurrenceKey": None, "phase": "step", "iterationPath": [],
        "requestId": "00000000-0000-4000-8000-000000000002",
        "classificationRequestId": "00000000-0000-4000-8000-000000000003",
        "classificationRequestDigest": digest(shared), "diffId": "diff", "reviewedHead": "head", "specHash": "a" * 64}
    request_bytes = canonical(request)
    occurrence = {key: request[key] for key in ("nodeId", "occurrenceKey", "parentOccurrenceKey", "phase", "iterationPath")}
    wait = {"kind": "review", "waitId": "wait", "request": {
        "version": 1, **{key: request[key] for key in ("executionId", "publicationId", "engineJobId", "engineEpoch")},
        "occurrence": occurrence, "engineRequestId": request["requestId"], "actionKey": "action",
        "reviewArea": "frontend", "visit": request, "visitDigest": digest(request_bytes), "deadlineRefs": []}}
    response = {"version": 1, "visit": request, "visitDigest": digest(request_bytes), "result": {
        "version": 1, "classificationRequestId": request["classificationRequestId"],
        "classificationRequestDigest": digest(shared), "classificationReceiptId": "classification",
        "state": classification_state, "relevance": {"frontend": True, "backend": False} if classification_state == "succeeded" else None,
        "error": None if classification_state == "succeeded" else "provider error"}}
    visit = {"requestBytes": request_bytes, "waitBytes": canonical(wait), "acceptedResultId": None,
        "projection": pending_review_projection()}
    start_review_projection(visit, START)
    accept_review_projection(visit, "classification")
    visit["acceptedResultBytes"] = canonical(response)
    journal = {"classificationRequestBytes": shared, "reviewVisits": {"visit": visit}}
    rows = {
        history.JOURNAL_KIND: SimpleNamespace(blob=canonical(journal)),
        history.acceptance_kind(request["requestId"]): SimpleNamespace(blob=canonical({
            "resultBytes": visit["acceptedResultBytes"], "waitBytes": visit["waitBytes"]})),
        "graph": SimpleNamespace(blob='{"external_waits":{}}'),
    }

    class Session:
        async def exec(self, statement):
            return None

    async def checkpoint(session, requested_job, kind):
        assert requested_job == job_id
        return rows.get(kind)

    monkeypatch.setattr(history, "checkpoint", checkpoint)
    result = await history.read_review_history(Session(), job_id)
    assert result[0]["state"] == "running"
    assert result[0]["projection"]["endedAt"] is None
    assert result[0]["acceptedResultId"] == "classification"
    visit["projection"].update(state="failed", endedAt=LATER, error="vertex error")
    rows[history.JOURNAL_KIND].blob = canonical(journal)
    result = await history.read_review_history(Session(), job_id)
    assert result[0]["state"] == "failed"
    assert result[0]["projection"]["error"] == "vertex error"
    assert json.loads(result[0]["acceptedResultBytes"])["result"]["state"] == classification_state
