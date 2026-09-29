import asyncio
from contextlib import asynccontextmanager
from types import SimpleNamespace

import pytest

from langflow.services.trellis_v1 import review_gate_operation as operation
from langflow.services.trellis_v1.review_gate_projection import pending_review_projection


@pytest.mark.asyncio
@pytest.mark.parametrize("projection_fails", [False, True])
async def test_projection_uses_writer_session_before_commit(monkeypatch, projection_fails):
    events = []
    sessions = []
    journal = {"classificationRequestId": "classification"}
    admission = {"executionId": "execution", "publicationId": "publication", "engineJobId": "job", "engineEpoch": 1}
    visit = {"waitBytes": "wait", "acceptedResultId": None, "projection": pending_review_projection()}
    graph = SimpleNamespace(_external_wait_lock=asyncio.Lock(), get_vertex=lambda _: object())

    class Session:
        async def commit(self):
            assert events[-1] == (self, "projection")
            events.append((self, "commit"))

    @asynccontextmanager
    async def open_session():
        session = Session()
        sessions.append(session)
        yield session

    async def locked(session, supplied_graph):
        assert supplied_graph is graph
        return "job", admission, object(), journal

    async def authority(*_args):
        return {"authority_bytes": "authority", "capability_id": "capability"}

    async def save_journal(session, job_id, supplied_journal):
        assert supplied_journal is journal
        events.append((session, "journal"))

    async def save_graph(session, job_id, supplied_graph):
        assert events[-1] == (session, "journal")
        events.append((session, "graph"))

    async def save_wait(session, job_id, supplied_graph, wait_bytes):
        assert events[-1] == (session, "journal")
        events.append((session, "wait"))
        return {"wait": wait_bytes}

    async def record(session, job_id):
        assert events[-1] in [(session, "graph"), (session, "wait")]
        if projection_fails:
            raise ValueError("projection refused")
        events.append((session, "projection"))

    async def context(*_args, **_kwargs):
        return "shared"

    monkeypatch.setattr(operation, "session_scope", open_session)
    monkeypatch.setattr(operation, "locked_graph", locked)
    monkeypatch.setattr(operation, "review_authority", authority)
    monkeypatch.setattr(operation, "save_journal", save_journal)
    monkeypatch.setattr(operation, "save_graph", save_graph)
    monkeypatch.setattr(operation, "save_wait", save_wait)
    monkeypatch.setattr(operation, "record_projection_checkpoint", record)
    monkeypatch.setattr(operation, "review_gate_transport", lambda: SimpleNamespace(context=context))
    monkeypatch.setattr(operation, "allocate_review", lambda *_args: visit)
    monkeypatch.setattr(operation, "read_review_wait", lambda _: None)
    monkeypatch.setattr(operation, "apply_waits", lambda *_args: None)
    if projection_fails:
        with pytest.raises(ValueError, match="projection refused"):
            await operation.request_review_visit(graph, "vertex", object())
        assert all(event != "commit" for _, event in events)
    else:
        result, _ = await operation.request_review_visit(graph, "vertex", object())
        assert result["projection"]["state"] == "running"
        assert result["projection"]["startedAt"] is not None
        assert [event for _, event in events] == ["journal", "graph", "projection", "commit",
                                                  "journal", "wait", "projection", "commit"]
        assert len(sessions) == 2
