from __future__ import annotations

from copy import deepcopy
from typing import Any


def _edge(edge_id: str, source: str, source_port: str, target: str, target_port: str) -> dict[str, Any]:
	return {
		"id": edge_id,
		"source": source,
		"target": target,
		"sourcePort": source_port,
		"targetPort": target_port,
	}


def expand_group_scope(group: dict[str, Any], nodes: list[dict[str, Any]], edges: list[dict[str, Any]]) -> dict[str, Any]:
	group_id = group["id"]
	children = [deepcopy(node) for node in nodes if node["parentId"] == group_id]
	child_ids = [node["id"] for node in children]
	child_by_id = {node["id"]: node for node in children}
	child_set = set(child_ids)
	internal = [deepcopy(edge) for edge in edges if edge["fromNodeId"] in child_set and edge["toNodeId"] in child_set]
	incoming = {edge["toNodeId"] for edge in internal}
	outgoing = {edge["fromNodeId"] for edge in internal}
	entry_ids = child_ids if group["parallel"] else [node_id for node_id in child_ids if node_id not in incoming]
	terminal_ids = child_ids if group["parallel"] else [node_id for node_id in child_ids if node_id not in outgoing]
	control_id = f"{group_id}:scope"
	output_id = f"{group_id}:output"
	settlement_ids = {node_id: f"{group_id}:settle:{node_id}" for node_id in child_ids}
	definition = {
		"version": 1,
		"groupNodeId": group_id,
		"parentGroupNodeId": group.get("parentId"),
		"scopeVertexId": control_id,
		"outputVertexId": output_id,
		"parallel": group["parallel"],
		"minutes": group.get("minutes"),
		"childNodeIds": child_ids,
		"childVertices": {
			node_id: {
				"inputVertexId": child_by_id[node_id]["inputVertexId"],
				"outputVertexId": child_by_id[node_id]["outputVertexId"],
			}
			for node_id in child_ids
		},
		"entryNodeIds": entry_ids,
		"terminalNodeIds": terminal_ids,
		"settlementVertexIds": settlement_ids,
		"edges": internal,
	}
	expanded_edges = [
		_edge(
			f"{control_id}:{node_id}",
			control_id,
			"entries",
			child_by_id[node_id]["inputVertexId"],
			child_by_id[node_id]["scopeInputPort"],
		)
		for node_id in entry_ids
	]
	if not group["parallel"]:
		expanded_edges.extend(
			_edge(
				edge["id"],
				child_by_id[edge["fromNodeId"]]["outputVertexId"],
				child_by_id[edge["fromNodeId"]]["outputPort"],
				child_by_id[edge["toNodeId"]]["inputVertexId"],
				child_by_id[edge["toNodeId"]]["inputPort"],
			)
			for edge in internal
		)
	for node_id in child_ids:
		child = child_by_id[node_id]
		expanded_edges.append(
			_edge(
				f"{node_id}:{settlement_ids[node_id]}",
				child["outputVertexId"],
				child["outputPort"],
				settlement_ids[node_id],
				"result",
			)
		)
		expanded_edges.append(
			_edge(f"{settlement_ids[node_id]}:{output_id}", settlement_ids[node_id], "settlement", output_id, "settlements")
		)
	source_associations = {group_id: [control_id, output_id]}
	for child in children:
		source_associations.update(child["sourceAssociations"])
		source_associations[child["id"]] = [*source_associations[child["id"]], settlement_ids[child["id"]]]
	return {
		"definition": definition,
		"nodes": [
			{"id": control_id, "component": "TrellisGroupScopeV1", "sourceNodeId": group_id},
			*[engine_node for child in children for engine_node in child["engineNodes"]],
			*[
				{
					"id": settlement_ids[node_id],
					"component": "TrellisGroupSettlementV1",
					"sourceNodeId": node_id,
				}
				for node_id in child_ids
			],
			{"id": output_id, "component": "TrellisGroupOutputV1", "sourceNodeId": group_id},
		],
		"edges": expanded_edges,
		"sourceAssociations": source_associations,
	}
