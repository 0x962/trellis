import json

import pytest

from langflow.services.trellis_v1.group_scope_reader import GroupScopeReadInput, _saved_control, _verify_group_entry
from langflow.services.trellis_v1.occurrence_journal import OccurrenceConflict
from langflow.services.trellis_v1.occurrence_models import VisitScope, digest


def read_input() -> GroupScopeReadInput:
    return GroupScopeReadInput.model_validate({
        "executionId": "execution",
        "publicationId": "publication",
        "engineJobId": "00000000-0000-4000-8000-000000000001",
        "engineEpoch": 7,
        "scopeVertexId": "group:scope",
        "occurrenceKey": "00000000-0000-4000-8000-000000000002",
    })


def test_retained_control_reconstructs_the_exact_scope_identity():
    occurrence = {
        "nodeId": "group",
        "occurrenceKey": read_input().occurrence_key,
        "parentOccurrenceKey": "inner:2",
        "phase": "children",
        "iterationPath": [{"loopNodeId": "outer", "round": 1}, {"loopNodeId": "inner", "round": 2}],
    }
    facts = {
        "inputReceiptIds": ["input-b", "input-a"],
        "groupDeadlineRefs": ["outer-deadline"],
        "deadlineAt": "2026-09-30T00:00:00Z",
    }
    scope = VisitScope.from_engine({
        "parentOccurrenceKey": occurrence["parentOccurrenceKey"],
        "phase": occurrence["phase"],
        "iterationPath": occurrence["iterationPath"],
        **facts,
    })
    raw_definition = json.dumps({"groupNodeId": "group", "minutes": 1441}, separators=(",", ":"))
    control = {
        "occurrence": occurrence,
        "facts": {"definitionHash": digest(raw_definition), "scope": facts},
    }
    journal = {"controls": {scope.identity(read_input().scope_vertex_id): control}}
    key, saved = _saved_control(journal, read_input().occurrence_key)
    assert key == scope.identity(read_input().scope_vertex_id)
    assert saved == control


def test_unknown_occurrence_has_no_readback_proof():
    with pytest.raises(ValueError, match="group_scope_control_missing"):
        _saved_control({"controls": {}}, read_input().occurrence_key)


def test_entered_group_parents_the_children_to_the_saved_occurrence():
    occurrence = {
        "nodeId": "group",
        "occurrenceKey": read_input().occurrence_key,
        "parentOccurrenceKey": "outer",
        "phase": "step",
        "iterationPath": [{"loopNodeId": "loop", "round": 3}],
    }
    allocation_scope = {
        "inputReceiptIds": ["boundary"],
        "groupDeadlineRefs": ["outer-deadline"],
        "deadlineAt": None,
    }
    child_scope = {
        "parentOccurrenceKey": occurrence["occurrenceKey"],
        "phase": "children",
        "iterationPath": occurrence["iterationPath"],
        **allocation_scope,
    }
    definition = {"groupNodeId": "group"}
    checkpoint = {
        "group_scope_definitions": {occurrence["occurrenceKey"]: definition},
        "group_visit_scopes": {occurrence["occurrenceKey"]: {"occurrence": occurrence, "scope": child_scope}},
    }
    _verify_group_entry(checkpoint, definition, occurrence, allocation_scope)
    checkpoint["group_visit_scopes"][occurrence["occurrenceKey"]]["scope"]["phase"] = "step"
    with pytest.raises(OccurrenceConflict, match="group_scope_entry_identity_conflict"):
        _verify_group_entry(checkpoint, definition, occurrence, allocation_scope)
