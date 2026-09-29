import copy
import json
from pathlib import Path

import pytest

from langflow.services.trellis_v1.occurrence_journal import (
    OccurrenceConflict, allocate, external_wait, replace_rejected,
)
from langflow.services.trellis_v1.occurrence_models import (
    Iteration, VisitScope, canonical, digest, task_key, validate_spec,
)


SPEC = {"nodeId": "node", "taskKeyBase": "review", "name": "Review", "instruction": "  café\n\n雪  ",
        "harness": {"preset": "codex", "model": " exact model ", "effort": "high",
                    "startCommand": "exact-start", "resumeCommand": "exact-resume"}}
ADMISSION = {"version": 1, "executionId": "execution", "publicationId": "publication",
             "engineJobId": "6ce9e3ed-cbf5-43cd-af82-c07c6e5ab3f0", "engineEpoch": 1,
             "admissionId": "admission", "submissionDigest": "a" * 64, "committedAt": "2026-09-29T00:00:00Z"}
SCOPE = VisitScope("parent", "condition", (Iteration("outer", 2), Iteration("inner", 3)),
                   ("output-b", "output-a"), ("deadline-original",), "2026-09-30T00:00:00Z")


def test_native_replay_after_serialized_journal_reopen():
    journal = {"revision": 0, "visits": {}}
    first = copy.deepcopy(allocate(journal, "engine-node", SCOPE, SPEC, ADMISSION, "native"))
    reopened = json.loads(canonical(journal))
    again = allocate(reopened, "engine-node", SCOPE, SPEC, {**ADMISSION, "engineEpoch": 9}, "native")
    assert first == again
    assert reopened["revision"] == 1
    request = json.loads(again["requestBytes"])
    assert request["inputReceiptIds"] == ["output-b", "output-a"]
    assert request["iterationPath"] == [{"loopNodeId": "outer", "round": 2}, {"loopNodeId": "inner", "round": 3}]
    assert request["deadlineAt"] == SCOPE.deadline_at
    assert request["requestId"] != again["waitId"]


def test_same_visit_refuses_changed_static_spec_or_original_deadline():
    journal = {"revision": 0, "visits": {}}
    allocate(journal, "engine-node", SCOPE, SPEC, ADMISSION, "native")
    with pytest.raises(OccurrenceConflict, match="replay"):
        allocate(journal, "engine-node", SCOPE, {**SPEC, "instruction": "changed"}, ADMISSION, "native")
    changed = VisitScope(SCOPE.parent_occurrence_key, SCOPE.phase, SCOPE.iteration_path,
                         SCOPE.input_receipt_ids, SCOPE.group_deadline_refs, None)
    with pytest.raises(OccurrenceConflict, match="replay"):
        allocate(journal, "engine-node", changed, SPEC, ADMISSION, "native")


def test_no_feedback_allocates_one_new_wait_and_preserves_original_revision():
    journal = {"revision": 0, "visits": {}}
    first = copy.deepcopy(allocate(journal, "engine-node", SCOPE, SPEC, ADMISSION, "human"))
    decision = {"wait": json.loads(first["requestBytes"]), "approved": False, "output": "  Fix 雪\n",
                "decisionId": "decision-1", "actor": {"kind": "human", "name": "Navid"}}
    old_wait, second = replace_rejected(journal, "engine-node", SCOPE, SPEC, ADMISSION, decision, None)
    assert old_wait == external_wait(first)
    assert second["feedback"] == [decision]
    assert second["prior"][0]["requestBytes"] == first["requestBytes"]
    one, two = json.loads(first["requestBytes"]), json.loads(second["requestBytes"])
    assert one["expectedRevision"] == 1 and two["expectedRevision"] == 2
    for field in ("engineRequestId", "actionKey"):
        assert one[field] != two[field]
    assert one["occurrence"]["occurrenceKey"] != two["occurrence"]["occurrenceKey"]
    assert allocate(journal, "engine-node", SCOPE, SPEC, ADMISSION, "human") == second


def test_round_limit_retains_full_feedback_before_terminal_error():
    journal = {"revision": 0, "visits": {}}
    first = allocate(journal, "engine-node", SCOPE, SPEC, ADMISSION, "human")
    decision = {"wait": json.loads(first["requestBytes"]), "approved": False, "output": "retained feedback"}
    _, stopped = replace_rejected(journal, "engine-node", SCOPE, SPEC, ADMISSION, decision, 1)
    assert stopped["feedback"] == [decision]
    assert stopped["terminalError"] == "human_round_limit"
    assert journal["revision"] == 1


def test_task_key_uses_full_semantic_tuple_and_ignores_occurrence_uuid():
    occurrence = SCOPE.occurrence("node", "one")
    expected = '["review","node","parent","condition",[["outer",2],["inner",3]]]'
    assert task_key(SPEC, occurrence) == expected
    assert task_key(SPEC, {**occurrence, "occurrenceKey": "two"}) == expected
    assert task_key(SPEC, {**occurrence, "phase": "children"}) != expected


def test_static_hash_preserves_strings_and_absent_account():
    expected = '{"harness":{"effort":"high","model":" exact model ","preset":"codex","resumeCommand":"exact-resume","startCommand":"exact-start"},"instruction":"  café\\n\\n雪  ","name":"Review","nodeId":"node","taskKeyBase":"review"}'
    assert canonical(SPEC) == expected
    assert validate_spec(SPEC) == digest(expected)
    assert validate_spec({**SPEC, "accountId": "chosen"}) != validate_spec(SPEC)
    with pytest.raises(ValueError):
        validate_spec({**SPEC, "accountId": None})


def test_utf16_key_order_and_well_formed_surrogate_serialization():
    assert canonical({"\ue000": 2, "𐀀": 1, "value": "\ud800"}) == '{"value":"\\ud800","𐀀":1,"\ue000":2}'


@pytest.mark.parametrize("case", json.loads(Path(__file__).with_name("spec-hash-cases.json").read_text()))
def test_shared_static_hash_cases(case):
    assert canonical(case["spec"]) == case["canonical"]
    assert validate_spec(case["spec"]) == case["sha256"]
