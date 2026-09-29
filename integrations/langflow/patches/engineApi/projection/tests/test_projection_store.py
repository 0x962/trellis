import json
from types import SimpleNamespace
from uuid import UUID

import pytest

from langflow.services.trellis_v1 import projection_store as store
from langflow.services.trellis_v1.projection_reader import read_projection_checkpoint

JOB_ID = UUID("00000000-0000-4000-8000-000000000001")


class Session:
    def __init__(self):
        self.reads = 0
        self.flushed = 0

    async def flush(self):
        self.flushed += 1

    async def exec(self, statement):
        self.reads += 1
        if self.reads % 2:
            row = SimpleNamespace(status=SimpleNamespace(value="in_progress"))
        else:
            row = SimpleNamespace(execution_id="execution-1", admission_receipt_bytes=json.dumps({
                "publicationId": "publication-1", "engineJobId": str(JOB_ID),
            }))
        return SimpleNamespace(one=lambda: row)


@pytest.fixture
def rows(monkeypatch):
    rows = {"graph": SimpleNamespace(id=JOB_ID, blob='{"external_waits":{},"vertices":{}}')}

    async def checkpoint(session, job_id, kind):
        assert job_id == JOB_ID
        return rows.get(kind)

    async def save(session, job_id, kind, blob):
        rows[kind] = SimpleNamespace(blob=blob)

    async def authority(session, execution_id):
        return SimpleNamespace(binding=SimpleNamespace(authority=SimpleNamespace(
            execution_id=execution_id, publication_id="publication-1", engine_job_id=JOB_ID, engine_epoch=1,
        )))

    async def reviews(session, job_id):
        return []

    monkeypatch.setattr(store, "checkpoint", checkpoint)
    monkeypatch.setattr(store, "save_blob", save)
    monkeypatch.setattr(store, "read_authority", authority)
    monkeypatch.setattr(store, "read_review_history", reviews)
    monkeypatch.setattr("langflow.services.trellis_v1.projection_reader.checkpoint", checkpoint)
    return rows


@pytest.mark.asyncio
async def test_equal_bytes_keep_identity_and_changed_bytes_advance(rows):
    session = Session()
    first = await store.record_projection_checkpoint(session, JOB_ID)
    repeat = await store.record_projection_checkpoint(session, JOB_ID)
    assert first == repeat
    rows["graph"].blob = '{"external_waits":{},"vertices":{"one":{"state":"pending"}}}'
    second = await store.record_projection_checkpoint(session, JOB_ID)
    assert second["sourceCursor"] == 2
    assert first["sourceBytes"] != second["sourceBytes"]
    original = await read_projection_checkpoint(session, JOB_ID, after=0, engine_epoch=1)
    assert original["snapshotBytes"] == first["snapshotBytes"]
    assert json.loads(first["snapshotBytes"])["graphCheckpointBytes"] == '{"external_waits":{},"vertices":{}}'


@pytest.mark.asyncio
async def test_raw_journal_is_retained_without_invented_times(rows):
    rows["trellis-occurrences-v1"] = SimpleNamespace(blob=' {"revision":1,"visits":{}} ')
    saved = await store.record_projection_checkpoint(Session(), JOB_ID)
    snapshot = json.loads(saved["snapshotBytes"])
    assert snapshot["occurrenceJournalBytes"] == ' {"revision":1,"visits":{}} '
    assert snapshot["jobOutcomeBytes"] is None
    assert "startedAt" not in snapshot
    source = json.loads(saved["sourceBytes"])
    assert source["occurrence"] is None
    assert source["payload"]["kind"] == "checkpoint_saved"


@pytest.mark.asyncio
async def test_cursor_gap_is_explicit(rows):
    session = Session()
    await store.record_projection_checkpoint(session, JOB_ID)
    rows["graph"].blob = '{"external_waits":{},"vertices":{"two":{}}}'
    latest = await store.record_projection_checkpoint(session, JOB_ID)
    del rows[store.snapshot_kind(1)]
    gap = await read_projection_checkpoint(session, JOB_ID, after=0, engine_epoch=1)
    assert gap["state"] == "gap"
    assert gap["sourceCursor"] == 2
    assert gap["snapshotBytes"] == latest["snapshotBytes"]


@pytest.mark.asyncio
async def test_new_owner_requires_saved_epoch(rows):
    await store.record_projection_checkpoint(Session(), JOB_ID)
    result = await read_projection_checkpoint(Session(), JOB_ID, after=0, engine_epoch=2)
    assert result == {"state": "unavailable", "reason": "projection_epoch_not_recorded"}
