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
	assert result["definition"]["scopeVertexId"] == "group:scope"
	assert result["definition"]["outputVertexId"] == "group:output"
	assert result["definition"]["childVertices"]["second"] == {
		"inputVertexId": "engine-second", "outputVertexId": "engine-second",
	}
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


def test_nested_group_uses_its_scope_for_entry_and_its_join_for_output():
	group = {"id": "outer", "parentId": None, "parallel": False, "minutes": None}
	nested = {
		"id": "inner",
		"parentId": "outer",
		"inputVertexId": "inner:scope",
		"outputVertexId": "inner:output",
		"inputPort": "boundary_inputs",
		"outputPort": "out",
		"scopeInputPort": "boundary_inputs",
		"engineNodes": [
			{"id": "inner:scope", "data": {"type": "TrellisGroupScopeV1"}},
			{"id": "inner:output", "data": {"type": "TrellisGroupOutputV1"}},
		],
		"sourceAssociations": {"inner": ["inner:scope", "inner:output"]},
	}
	leaf = node("leaf", "outer")
	result = expand_group_scope(
		group,
		[nested, leaf],
		[{"id": "inner-leaf", "fromNodeId": "inner", "toNodeId": "leaf", "branch": None}],
	)
	assert result["definition"]["childVertices"]["inner"] == {
		"inputVertexId": "inner:scope", "outputVertexId": "inner:output",
	}
	assert [(edge["source"], edge["target"]) for edge in result["edges"][:2]] == [
		("outer:scope", "inner:scope"), ("inner:output", "engine-leaf"),
	]
	assert result["sourceAssociations"]["inner"] == ["inner:scope", "inner:output", "outer:settle:inner"]


def node(node_id: str, parent_id: str) -> dict:
	return {
		"id": node_id,
		"parentId": parent_id,
		"inputVertexId": f"engine-{node_id}",
		"outputVertexId": f"engine-{node_id}",
		"inputPort": "input",
		"outputPort": "result",
		"scopeInputPort": "scope_context",
		"engineNodes": [{"id": f"engine-{node_id}", "data": {"type": "Fixture"}}],
		"sourceAssociations": {node_id: [f"engine-{node_id}"]},
	}
