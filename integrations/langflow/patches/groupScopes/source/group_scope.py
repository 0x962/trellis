from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ScopeModel(BaseModel):
    model_config = ConfigDict(alias_generator=lambda value: "".join(
        [value.split("_")[0], *[part.title() for part in value.split("_")[1:]]]
    ), populate_by_name=True, extra="forbid", frozen=True)


class ScopeEdge(ScopeModel):
    id: str
    from_node_id: str
    to_node_id: str
    branch: str | None = None


class GroupScopeDefinition(ScopeModel):
    version: Literal[1]
    group_node_id: str
    parent_group_node_id: str | None
    parallel: bool
    minutes: int | None = Field(default=None, gt=0)
    child_node_ids: tuple[str, ...]
    entry_node_ids: tuple[str, ...]
    terminal_node_ids: tuple[str, ...]
    settlement_node_ids: dict[str, str]
    edges: tuple[ScopeEdge, ...]


class GroupSettlement(ScopeModel):
    node_id: str
    occurrence_key: str | None
    state: Literal["completed", "failed", "skipped"]
    output_bytes: str
    receipt_id: str | None


def open_group_scope(graph, definition, group_occurrence_key: str, loop_visit_key: str | None, scope: dict) -> dict:
    key = group_occurrence_key
    saved_definition = graph.group_scope_definitions.get(key)
    encoded_definition = definition.model_dump(by_alias=True)
    encoded_visit = {"loopVisitKey": loop_visit_key, "scope": scope}
    if saved_definition is not None and saved_definition != encoded_definition:
        raise ValueError("group_scope_definition_conflict")
    if key in graph.group_visit_scopes and graph.group_visit_scopes[key] != encoded_visit:
        raise ValueError("group_scope_visit_conflict")
    graph.group_scope_definitions[key] = encoded_definition
    graph.group_visit_scopes[key] = encoded_visit
    graph.group_scope_settlements.setdefault(key, {})
    for node_id in definition.child_node_ids:
        graph.group_active_occurrences[node_id] = key
        graph.group_active_occurrences[definition.settlement_node_ids[node_id]] = key
    return scope


def group_visit_scope(graph, group_occurrence_key: str, vertex_id: str) -> dict:
    definition = GroupScopeDefinition.model_validate(graph.group_scope_definitions[group_occurrence_key])
    if vertex_id not in definition.child_node_ids and vertex_id not in definition.settlement_node_ids.values():
        raise ValueError("group_scope_vertex_unknown")
    return graph.group_visit_scopes[group_occurrence_key]["scope"]


def settle_group_child(graph, group_occurrence_key: str, settlement: GroupSettlement) -> GroupSettlement:
    definition = GroupScopeDefinition.model_validate(graph.group_scope_definitions[group_occurrence_key])
    if settlement.node_id not in definition.child_node_ids:
        raise ValueError("group_scope_child_unknown")
    records = graph.group_scope_settlements[group_occurrence_key]
    encoded = settlement.model_dump(by_alias=True)
    if settlement.node_id in records and records[settlement.node_id] != encoded:
        raise ValueError("group_scope_settlement_conflict")
    records[settlement.node_id] = encoded
    return settlement


def settle_group_exclusions(graph, excluded_vertex_ids: set[str]) -> set[str]:
    settled_vertices: set[str] = set()
    active_keys = {graph.group_active_occurrences[vertex_id] for vertex_id in excluded_vertex_ids
                   if vertex_id in graph.group_active_occurrences}
    for key in active_keys:
        raw_definition = graph.group_scope_definitions[key]
        definition = GroupScopeDefinition.model_validate(raw_definition)
        for node_id in definition.child_node_ids:
            settlement_id = definition.settlement_node_ids[node_id]
            if node_id not in excluded_vertex_ids and settlement_id not in excluded_vertex_ids:
                continue
            settle_group_child(graph, key, GroupSettlement(
                nodeId=node_id, occurrenceKey=None, state="skipped", outputBytes="", receiptId=None,
            ))
            settled_vertices.add(node_id)
            settled_vertices.add(settlement_id)
    return settled_vertices


def group_scope_output(graph, group_occurrence_key: str) -> dict:
    definition = GroupScopeDefinition.model_validate(graph.group_scope_definitions[group_occurrence_key])
    records = graph.group_scope_settlements[group_occurrence_key]
    if set(records) != set(definition.child_node_ids):
        raise ValueError("group_scope_incomplete")
    ordered = [GroupSettlement.model_validate(records[node_id]) for node_id in definition.child_node_ids]
    return {
        "groupOccurrenceKey": group_occurrence_key,
        "outputBytes": "\n\n".join(item.output_bytes for item in ordered if item.state != "skipped"),
        "children": [item.model_dump(by_alias=True) for item in ordered],
    }


def group_scope_deadlines(graph, group_occurrence_key: str) -> tuple[tuple[str, ...], str | None]:
    scope = graph.group_visit_scopes[group_occurrence_key]["scope"]
    return tuple(scope["groupDeadlineRefs"]), scope["deadlineAt"]
