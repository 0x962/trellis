from integrations.langflow.components.groupScope import expand_group_scope


def test_connected_group_uses_explicit_entries_edges_and_source_associations():
	group = {"id": "group", "parentId": None, "parallel": False, "minutes": 900}
	nodes = [node(node_id, "group") for node_id in ("first", "second", "third")]
	edges = [
		{"id": "one-two", "fromNodeId": "first", "toNodeId": "second", "branch": None},
		{"id": "one-three", "fromNodeId": "first", "toNodeId": "third", "branch": "yes"},
		{"id": "two-three", "fromNodeId": "second", "toNodeId": "third", "branch": None},
	]
	result = expand_group_scope(group, nodes, edges)
	assert result["definition"]["entryNodeIds"] == ["first"]
	assert result["definition"]["terminalNodeIds"] == ["third"]
	assert result["definition"]["minutes"] == 900
	assert result["sourceAssociations"]["group"] == ["group:scope", "group:output"]
	assert [edge for edge in result["edges"] if edge["id"] == "one-three"] == [{
		"id": "one-three",
		"source": "engine-first",
		"target": "engine-third",
		"sourcePort": "result",
		"targetPort": "input",
	}]


def test_parallel_group_releases_every_child_through_scope_edges():
	group = {"id": "parallel", "parentId": "outer", "parallel": True, "minutes": None}
	nodes = [node(node_id, "parallel") for node_id in ("a", "b", "c")]
	result = expand_group_scope(group, nodes, [])
	assert result["definition"]["entryNodeIds"] == ["a", "b", "c"]
	assert result["definition"]["terminalNodeIds"] == ["a", "b", "c"]
	assert [(edge["source"], edge["target"]) for edge in result["edges"][:3]] == [
		("parallel:scope", "engine-a"),
		("parallel:scope", "engine-b"),
		("parallel:scope", "engine-c"),
	]


def node(node_id: str, parent_id: str) -> dict:
	return {
		"id": node_id,
		"parentId": parent_id,
		"engineNodeId": f"engine-{node_id}",
		"inputPort": "input",
		"outputPort": "result",
		"scopeInputPort": "scope_context",
		"engineNode": {"id": f"engine-{node_id}", "data": {"type": "Fixture"}},
	}
