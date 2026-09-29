from lfx.graph import Graph
from lfx.graph.group_scope import (
    GroupScopeDefinition,
    GroupSettlement,
    activate_group_occurrence,
    open_group_scope,
    settle_group_child,
    settle_group_exclusions,
)


def definition(*, parallel: bool = False) -> GroupScopeDefinition:
    return GroupScopeDefinition.model_validate({
        "version": 1,
        "groupNodeId": "group",
        "parentGroupNodeId": None,
        "scopeVertexId": "group-scope",
        "outputVertexId": "group-output",
        "parallel": parallel,
        "minutes": 700,
        "childNodeIds": ["first", "second", "third"],
        "childVertices": {
            "first": {"inputVertexId": "engine-first", "outputVertexId": "engine-first"},
            "second": {"inputVertexId": "engine-second", "outputVertexId": "engine-second"},
            "third": {"inputVertexId": "engine-third-in", "outputVertexId": "engine-third-out"},
        },
        "entryNodeIds": ["first", "second", "third"] if parallel else ["first"],
        "terminalNodeIds": ["first", "second", "third"] if parallel else ["third"],
        "settlementVertexIds": {"first": "settle-first", "second": "settle-second", "third": "settle-third"},
        "edges": [
            {"id": "one-two", "fromNodeId": "first", "toNodeId": "second", "branch": None},
            {"id": "one-three", "fromNodeId": "first", "toNodeId": "third", "branch": "yes"},
            {"id": "two-three", "fromNodeId": "second", "toNodeId": "third", "branch": None},
        ],
    })


def visit() -> dict:
    return {
        "parentOccurrenceKey": "inner:2",
        "phase": "children",
        "iterationPath": [{"loopNodeId": "outer", "round": 1}, {"loopNodeId": "inner", "round": 2}],
        "inputReceiptIds": ["input-b", "input-a"],
        "groupDeadlineRefs": ["outer-deadline", "group-deadline"],
        "deadlineAt": "2026-09-30T00:00:00Z",
    }


def occurrence() -> dict:
    return {
        "nodeId": "group",
        "occurrenceKey": "group:inner:2",
        "parentOccurrenceKey": "inner:2",
        "phase": "children",
        "iterationPath": [{"loopNodeId": "outer", "round": 1}, {"loopNodeId": "inner", "round": 2}],
    }


def activate(graph: Graph, group_definition: GroupScopeDefinition) -> None:
    activate_group_occurrence(graph, "group-scope", occurrence(), "loop-visit-2", visit())
    open_group_scope(graph, group_definition)


def settlement(node_id: str, text: str, state: str = "completed") -> GroupSettlement:
    return GroupSettlement.model_validate({
        "nodeId": node_id,
        "occurrenceKey": f"{node_id}:visit",
        "state": state,
        "outputBytes": text,
        "receiptId": f"{node_id}:receipt",
    })


def test_connected_diamond_keeps_context_deadlines_and_source_order():
    graph = Graph()
    activate(graph, definition())
    settle_group_child(graph, "group:inner:2", settlement("third", "C"))
    settle_group_child(graph, "group:inner:2", settlement("first", " A\n"))
    settle_group_child(graph, "group:inner:2", settlement("second", "B", "failed"))
    assert graph.group_scope_output("group:inner:2")["outputBytes"] == " A\n\n\nB\n\nC"
    assert graph.group_scope_deadlines("group:inner:2") == (
        ("outer-deadline", "group-deadline"), "2026-09-30T00:00:00Z",
    )
    child_scope = graph.group_visit_scope("group:inner:2", "engine-second")
    assert child_scope["parentOccurrenceKey"] == "inner:2"
    assert child_scope["iterationPath"] == [
        {"loopNodeId": "outer", "round": 1}, {"loopNodeId": "inner", "round": 2},
    ]
    assert child_scope["inputReceiptIds"] == ["input-b", "input-a"]
    assert graph.current_group_occurrence("engine-second") == "group:inner:2"
    assert graph.group_scope_visit("group:inner:2")["occurrence"] == occurrence()


def test_parallel_scope_records_skipped_children_before_join():
    graph = Graph()
    activate(graph, definition(parallel=True))
    settle_group_child(graph, "group:inner:2", settlement("first", "A"))
    settle_group_child(graph, "group:inner:2", settlement("third", "C"))
    assert settle_group_exclusions(graph, {"settle-second"}) == {"engine-second", "settle-second"}
    result = graph.group_scope_output("group:inner:2")
    assert result["outputBytes"] == "A\n\nC"
    assert result["children"][1] == {
        "nodeId": "second",
        "occurrenceKey": None,
        "state": "skipped",
        "outputBytes": "",
        "receiptId": None,
    }


def test_reopened_scope_replays_the_same_records():
    graph = Graph()
    graph.set_run_id("group-restart")
    saved_visit = visit()
    activate_group_occurrence(graph, "group-scope", occurrence(), "loop-visit-2", saved_visit)
    open_group_scope(graph, definition())
    settle_group_child(graph, "group:inner:2", settlement("first", "A"))
    resumed = Graph.resume_from_checkpoint(graph.build_checkpoint())
    activate_group_occurrence(resumed, "group-scope", occurrence(), "loop-visit-2", saved_visit)
    open_group_scope(resumed, definition())
    settle_group_child(resumed, "group:inner:2", settlement("first", "A"))
    assert resumed.group_scope_settlements["group:inner:2"]["first"]["outputBytes"] == "A"
