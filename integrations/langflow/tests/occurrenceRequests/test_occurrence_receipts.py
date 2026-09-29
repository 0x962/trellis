import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from langflow.services.trellis_v1 import occurrence_receipts as receipts
from langflow.services.trellis_v1 import occurrence_store as store
from langflow.services.trellis_v1.occurrence_journal import OccurrenceConflict
from langflow.services.trellis_v1.occurrence_models import VisitScope, canonical
from langflow.services.trellis_v1.occurrence_outputs import component_output


SCOPE = VisitScope(None, "step", (), (), (), None)
ADMISSION = {"executionId": "execution", "publicationId": "publication"}
OCCURRENCE = SCOPE.occurrence("node", "occurrence")


@pytest.mark.asyncio
async def test_receipt_replay_keeps_exact_text_and_refuses_changed_result(monkeypatch):
    rows = {}
    async def read(session, job_id, kind):
        return rows.get(kind)
    def add(session, job_id, kind, blob):
        rows[kind] = SimpleNamespace(blob=blob)
    monkeypatch.setattr(receipts, "checkpoint", read)
    monkeypatch.setattr(receipts, "add_checkpoint", add)
    session = SimpleNamespace(flush=AsyncMock())
    journal = {}
    args = dict(vertex_id="vertex", scope=SCOPE, occurrence=OCCURRENCE, port="out",
                output="  café\n\n雪  ", result_bytes='{"outputBytes":"  café\\n\\n雪  "}')
    first = await receipts.retain_output(session, "job", ADMISSION, journal, **args)
    again = await receipts.retain_output(session, "job", ADMISSION, journal, **args)
    assert first == again
    assert component_output(first, "succeeded")["trellisOutput"]["outputBytes"] == args["output"]
    with pytest.raises(OccurrenceConflict, match="output_receipt_replay_conflict"):
        await receipts.retain_output(session, "job", ADMISSION, journal, **{**args, "output": "changed"})
    wrapped = await receipts.read_receipt(session, "job", ADMISSION, first["receiptId"])
    assert list(wrapped) == ["receiptId", "receiptBytes", "receiptDigest"]
    assert json.loads(wrapped["receiptBytes"])["output"] == args["output"]


@pytest.mark.asyncio
async def test_subgraph_wait_save_uses_root_and_preserves_shared_map(monkeypatch):
    waits = {"old": "original"}
    snapshot = SimpleNamespace(external_waits=dict(waits))
    snapshot.model_dump_json = lambda: canonical({"external_waits": snapshot.external_waits, "root": True})
    root = SimpleNamespace(build_checkpoint=lambda: snapshot)
    child = SimpleNamespace(trellis_checkpoint_root=root, external_waits=waits)
    saved = AsyncMock()
    monkeypatch.setattr(store, "save_blob", saved)
    result = await store.save_wait(object(), "job", child, '{"waitId":"new"}')
    store.apply_waits(child, result)
    assert child.external_waits is waits
    assert waits == {"old": "original", "new": '{"waitId":"new"}'}
    assert json.loads(saved.call_args.args[3])["root"] is True


@pytest.mark.asyncio
async def test_original_human_decision_retains_whitespace_and_full_no_feedback():
    raw = '{ "decisionId": "decision", "approved": false, "output": "NO: fix 雪" }'
    row = SimpleNamespace(decision_bytes=raw.encode(), payload_digest=receipts.digest(raw))
    session = SimpleNamespace(exec=AsyncMock(return_value=SimpleNamespace(one=lambda: row)))
    assert await receipts.original_decision(session, "job", json.loads(raw)) == raw
