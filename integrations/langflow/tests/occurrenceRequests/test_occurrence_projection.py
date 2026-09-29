import copy
import json

from langflow.services.trellis_v1.occurrence_journal import allocate, replace_rejected
from langflow.services.trellis_v1.occurrence_models import canonical
from langflow.services.trellis_v1.occurrence_projection import retain_accepted_result

from test_occurrence_journal import ADMISSION, SCOPE, SPEC


def test_native_acceptance_uses_completion_id_without_vertex_success():
    journal = {"revision": 0, "visits": {}}
    visit = allocate(journal, "vertex", SCOPE, SPEC, ADMISSION, "native")
    assert visit["projection"]["state"] == "pending"
    visit["projection"]["state"] = "unknown"
    retain_accepted_result(visit, {"completionId": "completion", "resultId": "output-source"})
    assert visit["projection"] == {
        "state": "unknown", "acceptedResultId": "completion", "startedAt": None,
        "endedAt": None, "error": None, "skipReason": None,
    }
    reopened = json.loads(canonical(journal))
    assert allocate(reopened, "vertex", SCOPE, SPEC, ADMISSION, "native") == visit


def test_human_replacement_retains_terminal_history_and_new_wait_state():
    journal = {"revision": 0, "visits": {}}
    first = allocate(journal, "vertex", SCOPE, SPEC, ADMISSION, "human")
    original = copy.deepcopy(first)
    decision = {"wait": json.loads(first["requestBytes"]), "approved": False,
                "decisionId": "decision", "output": "Exact feedback\n雪"}
    _, replacement = replace_rejected(journal, "vertex", SCOPE, SPEC, ADMISSION, decision, None)
    prior = replacement["prior"][0]
    assert prior["occurrence"] == original["occurrence"]
    assert prior["requestBytes"] == original["requestBytes"]
    assert prior["projection"]["state"] == "skipped"
    assert prior["projection"]["skipReason"] == "human_feedback_replaced"
    assert prior["projection"]["acceptedResultId"] == "decision"
    assert prior["projection"]["endedAt"].endswith("Z")
    assert prior["projection"]["startedAt"] is None
    assert replacement["projection"]["state"] == "waiting_human"
    assert replacement["projection"]["acceptedResultId"] is None
    assert replacement["projection"]["endedAt"] is None
    assert replacement["feedback"] == [decision]
    assert allocate(journal, "vertex", SCOPE, SPEC, ADMISSION, "human") == replacement
