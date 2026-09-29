from lfx.graph.group_scope import (
    GroupScopeDefinition,
    GroupSettlement,
    group_scope_deadlines,
    group_scope_output,
    group_visit_scope,
    open_group_scope,
    settle_group_child,
    settle_group_exclusions,
)


class GraphFixture:
    def __init__(self) -> None:
        self.group_scope_definitions = {}
        self.group_visit_scopes = {}
        self.group_scope_settlements = {}
        self.group_active_occurrences = {}


def definition(*, parallel: bool = False) -> GroupScopeDefinition:
    return GroupScopeDefinition.model_validate({
        "version": 1,
        "groupNodeId": "group",
        "parentGroupNodeId": None,
        "parallel": parallel,
        "minutes": 700,
        "childNodeIds": ["first", "second", "third"],
        "entryNodeIds": ["first", "second", "third"] if parallel else ["first"],
        "terminalNodeIds": ["first", "second", "third"] if parallel else ["third"],
        "settlementNodeIds": {"first": "settle-first", "second": "settle-second", "third": "settle-third"},
        "edges": [
            {"id": "one-two", "fromNodeId": "first", "toNodeId": "second", "branch": None},
            {"id": "one-three", "fromNodeId": "first", "toNodeId": "third", "branch": "yes"},
            {"id": "two-three", "fromNodeId": "second", "toNodeId": "third", "branch": None},
        ],
    })


def visit() -> dict:
    return {
        "parentOccurrenceKey": "loop:2",
        "phase": "children",
        "iterationPath": [{"loopNodeId": "loop", "round": 2}],
        "inputReceiptIds": ["input-b", "input-a"],
        "groupDeadlineRefs": ["outer-deadline", "group-deadline"],
        "deadlineAt": "2026-09-30T00:00:00Z",
    }


def settlement(node_id: str, text: str, state: str = "completed") -> GroupSettlement:
    return GroupSettlement.model_validate({
        "nodeId": node_id,
        "occurrenceKey": f"{node_id}:visit",
        "state": state,
        "outputBytes": text,
        "receiptId": f"{node_id}:receipt",
    })


def test_connected_diamond_keeps_context_deadlines_and_source_order():
    graph = GraphFixture()
    open_group_scope(graph, definition(), "group:loop:2", "loop-visit-2", visit())
    settle_group_child(graph, "group:loop:2", settlement("third", "C"))
    settle_group_child(graph, "group:loop:2", settlement("first", " A\n"))
    settle_group_child(graph, "group:loop:2", settlement("second", "B", "failed"))
    assert group_scope_output(graph, "group:loop:2")["outputBytes"] == " A\n\n\nB\n\nC"
    assert group_scope_deadlines(graph, "group:loop:2") == (
        ("outer-deadline", "group-deadline"), "2026-09-30T00:00:00Z",
    )
    child_scope = group_visit_scope(graph, "group:loop:2", "second")
    assert child_scope["parentOccurrenceKey"] == "loop:2"
    assert child_scope["iterationPath"][0]["round"] == 2
    assert child_scope["inputReceiptIds"] == ["input-b", "input-a"]


def test_parallel_scope_records_skipped_children_before_join():
    graph = GraphFixture()
    open_group_scope(graph, definition(parallel=True), "group:loop:2", "loop-visit-2", visit())
    settle_group_child(graph, "group:loop:2", settlement("first", "A"))
    settle_group_child(graph, "group:loop:2", settlement("third", "C"))
    assert settle_group_exclusions(graph, {"settle-second"}) == {"second", "settle-second"}
    result = group_scope_output(graph, "group:loop:2")
    assert result["outputBytes"] == "A\n\nC"
    assert result["children"][1] == {
        "nodeId": "second",
        "occurrenceKey": None,
        "state": "skipped",
        "outputBytes": "",
        "receiptId": None,
    }


def test_reopened_scope_replays_the_same_records():
    graph = GraphFixture()
    saved_visit = visit()
    open_group_scope(graph, definition(), "group:loop:2", "loop-visit-2", saved_visit)
    settle_group_child(graph, "group:loop:2", settlement("first", "A"))
    open_group_scope(graph, definition(), "group:loop:2", "loop-visit-2", saved_visit)
    settle_group_child(graph, "group:loop:2", settlement("first", "A"))
    assert graph.group_scope_settlements["group:loop:2"]["first"]["outputBytes"] == "A"
