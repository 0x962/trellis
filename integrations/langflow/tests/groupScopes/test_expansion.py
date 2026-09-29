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
		"settlementSourceVertexId": "engine-second",
	}
	assert result["sourceAssociations"]["group"] == ["group:scope", "group:output"]
	assert [edge for edge in result["edges"] if edge["id"] == "one-three"] == [{
		"id": "one-three",
		"source": "engine-first",
		"target": "engine-third",
		"sourcePort": "yes",
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
		"settlementSourceVertexId": "inner:output",
		"inputPort": "boundary_inputs",
		"outputPorts": {"out": "out"},
		"settlementOutputPort": "out",
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
		"settlementSourceVertexId": "inner:output",
	}
	assert next(edge for edge in result["edges"] if edge["id"] == "outer:scope:inner")["target"] == "inner:scope"
	assert next(edge for edge in result["edges"] if edge["id"] == "inner-leaf")["source"] == "inner:output"
	assert result["sourceAssociations"]["inner"] == ["inner:scope", "inner:output", "outer:settle:inner"]


def test_empty_group_opens_the_scope_before_the_empty_output():
	result = expand_group_scope(
		{"id": "empty", "parentId": None, "parallel": False, "minutes": None},
		[],
		[],
	)
	assert result["definition"]["childNodeIds"] == []
	assert result["edges"] == [{
		"id": "empty:scope:empty:output",
		"source": "empty:scope",
		"target": "empty:output",
		"sourcePort": "entries",
		"targetPort": "scope_entry",
	}]
	assert result["nodes"][0]["templateValues"]["scope_definition"]


def test_entry_loop_uses_scope_entry_without_supplying_seed():
	group = {"id": "group", "parentId": None, "parallel": False, "minutes": None}
	loop = {
		**node("loop", "group"),
		"scopeInputPort": "scope_entry",
		"inputPort": "seed",
	}
	result = expand_group_scope(group, [loop], [])
	entry = next(edge for edge in result["edges"] if edge["id"] == "group:scope:loop")
	assert entry == {
		"id": "group:scope:loop",
		"source": "group:scope",
		"target": "engine-loop",
		"sourcePort": "entries",
		"targetPort": "scope_entry",
	}
	assert all(edge["targetPort"] != "seed" for edge in result["edges"])


def test_gate_routes_by_branch_and_settles_from_one_common_result():
	group = {"id": "group", "parentId": None, "parallel": False, "minutes": None}
	gate = {
		**node("gate", "group"),
		"outputVertexId": "gate:decision",
		"outputPorts": {"yes": "yes", "no": "no"},
		"settlementSourceVertexId": "gate:completion",
		"settlementOutputPort": "result",
	}
	follow = node("follow", "group")
	result = expand_group_scope(
		group,
		[gate, follow],
		[{"id": "gate-yes-follow", "fromNodeId": "gate", "toNodeId": "follow", "branch": "yes"}],
	)
	assert next(edge for edge in result["edges"] if edge["id"] == "gate-yes-follow")["sourcePort"] == "yes"
	settlement = next(edge for edge in result["edges"] if edge["id"] == "gate:group:settle:gate")
	assert (settlement["source"], settlement["sourcePort"], settlement["targetPort"]) == (
		"gate:completion", "result", "result",
	)


def node(node_id: str, parent_id: str) -> dict:
	return {
		"id": node_id,
		"parentId": parent_id,
		"inputVertexId": f"engine-{node_id}",
		"outputVertexId": f"engine-{node_id}",
		"settlementSourceVertexId": f"engine-{node_id}",
		"inputPort": "input",
		"outputPorts": {"out": "result", "yes": "yes", "no": "no"},
		"settlementOutputPort": "result",
		"scopeInputPort": "scope_context",
		"engineNodes": [{"id": f"engine-{node_id}", "data": {"type": "Fixture"}}],
		"sourceAssociations": {node_id: [f"engine-{node_id}"]},
	}
