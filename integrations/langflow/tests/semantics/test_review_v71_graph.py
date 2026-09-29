from __future__ import annotations

import hashlib
import json
import os
import sys
from pathlib import Path
from typing import Any

SOURCE_ROOT = Path(os.environ["LANGFLOW_SOURCE_ROOT"]).resolve()
sys.path.insert(0, str(SOURCE_ROOT / "src" / "backend"))

from lfx.custom.custom_component.component import Component
from lfx.graph import Graph
from lfx.inputs.inputs import HandleInput
from lfx.schema.data import Data
from lfx.template.field.base import Output

FIXTURE_ROOT = Path(__file__).parent
MANIFEST = json.loads((FIXTURE_ROOT / "review_v71_manifest.json").read_text())


def _data(node_id: str, text: str) -> Data:
	return Data(data={"nodeId": node_id, "text": text})


class RecordedStep(Component):
	display_name = "Recorded Review Step"
	inputs = [HandleInput(name="trigger", display_name="Trigger", input_types=["Data"], is_list=True, required=False)]
	outputs = [Output(display_name="Result", name="result", method="run", types=["Data"])]

	def run(self) -> Data:
		assert self.recorded_output is not None
		return _data(self.node_id, self.recorded_output)


class RecordedGate(Component):
	display_name = "Recorded Review Gate"
	inputs = [HandleInput(name="trigger", display_name="Trigger", input_types=["Data"], is_list=True, required=False)]
	outputs = [
		Output(display_name="Trace", name="trace", method="trace", types=["Data"], group_outputs=True),
		Output(display_name="Yes", name="yes", method="yes", types=["Data"], group_outputs=True),
		Output(display_name="No", name="no", method="no", types=["Data"], group_outputs=True),
	]

	def trace(self) -> Data:
		return _data(self.node_id, self.recorded_output)

	def yes(self) -> Data:
		if self.decision != "yes":
			self.stop("yes")
		return _data(self.node_id, self.recorded_output)

	def no(self) -> Data:
		if self.decision != "no":
			self.stop("no")
		return _data(self.node_id, self.recorded_output)


class RecordedJoin(Component):
	display_name = "Recorded Review Group"
	inputs = [HandleInput(name="items", display_name="Items", input_types=["Data"], is_list=True)]
	outputs = [Output(display_name="Result", name="result", method="run", types=["Data"])]

	def run(self) -> Data:
		assert self.recorded_output is not None
		items = self.items if isinstance(self.items, list) else [self.items]
		by_id = {item.data["nodeId"]: item.data["text"] for item in items}
		actual = "\n\n".join(by_id[node_id] for node_id in self.child_ids if node_id in by_id)
		assert actual == self.recorded_output
		return _data(self.node_id, actual)


def _canonical(value: Any) -> str:
	return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _sha_text(value: str) -> str:
	return hashlib.sha256(value.encode()).hexdigest()


def _projection(run: dict[str, Any]) -> dict[str, Any]:
	flow = run["doc"]["flow"]
	return {
		"flow": {key: flow[key] for key in ("id", "slug", "version", "briefing", "harness")},
		"nodes": run["doc"]["nodes"],
		"edges": run["doc"]["edges"],
		"steps": [
			{key: step.get(key) for key in ("nodeId", "output", "decision")}
			for step in run["state"]["steps"]
		],
	}


def _load_run() -> dict[str, Any]:
	path = Path(os.environ["TRELLIS_REVIEW_V71_RUN"]).resolve()
	return json.loads(path.read_text())


def _assert_private_trace(run: dict[str, Any]) -> None:
	flow = run["doc"]["flow"]
	nodes = run["doc"]["nodes"]
	steps = run["state"]["steps"]
	assert run["id"] == MANIFEST["runId"]
	assert flow["id"] == MANIFEST["flowId"]
	assert flow["version"] == MANIFEST["flowVersion"]
	assert flow["harness"] == MANIFEST["harness"]
	assert len(nodes) == MANIFEST["nodeCount"]
	assert len(run["doc"]["edges"]) == MANIFEST["edgeCount"]
	assert _sha_text(flow["briefing"]) == MANIFEST["briefingSha256"]
	assert _sha_text(_canonical(_projection(run))) == MANIFEST["projectionSha256"]
	assert {node["id"]: _sha_text(node["instruction"]) for node in nodes} == MANIFEST["instructions"]
	assert {
		step["nodeId"]: _sha_text(_canonical(step.get("output"))) for step in steps
	} == MANIFEST["outputs"]
	assert {
		step["nodeId"]: step["decision"] for step in steps if step.get("decision") is not None
	} == MANIFEST["decisions"]


class ReviewGraph:
	def __init__(self, run: dict[str, Any]) -> None:
		self.nodes = {node["id"]: node for node in run["doc"]["nodes"]}
		self.outputs = {step["nodeId"]: step.get("output") for step in run["state"]["steps"]}
		self.decisions = {step["nodeId"]: step.get("decision") for step in run["state"]["steps"]}
		self.edges = run["doc"]["edges"]
		self.graph = Graph()
		self._add_components()
		self._wire_groups()
		self._wire_order()

	def _children(self, parent_id: str | None, *, top_level: bool = False) -> list[dict[str, Any]]:
		children = [node for node in self.nodes.values() if node.get("parentId") == parent_id]
		key = (lambda node: (node["x"], node["y"], node["id"])) if top_level else (
			lambda node: (node["y"], node["x"], node["id"])
		)
		return sorted(children, key=key)

	def _add_components(self) -> None:
		for node_id, node in self.nodes.items():
			if node["kind"] == "group":
				component = RecordedJoin(_id=node_id)
				component.child_ids = [child["id"] for child in self._children(node_id)]
			elif node["kind"] == "gate":
				component = RecordedGate(_id=node_id)
				component.decision = self.decisions[node_id]
			else:
				component = RecordedStep(_id=node_id)
			component.node_id = node_id
			component.recorded_output = self.outputs[node_id]
			self.graph.add_component(component, node_id)

	def _source_output(self, node_id: str) -> str:
		return "trace" if self.nodes[node_id]["kind"] == "gate" else "result"

	def _entries(self, node_id: str) -> list[str]:
		node = self.nodes[node_id]
		if node["kind"] != "group":
			return [node_id]
		children = self._children(node_id)
		selected = children if node["parallel"] else children[:1]
		return [entry for child in selected for entry in self._entries(child["id"])]

	def _connect(self, source_id: str, output_name: str, target_id: str) -> None:
		for entry in self._entries(target_id):
			self.graph.add_component_edge(source_id, (output_name, "trigger"), entry)

	def _wire_groups(self) -> None:
		for node_id, node in self.nodes.items():
			if node["kind"] != "group":
				continue
			for child in self._children(node_id):
				self.graph.add_component_edge(child["id"], (self._source_output(child["id"]), "items"), node_id)

	def _wire_order(self) -> None:
		explicit = {(edge["fromNodeId"], edge["toNodeId"]): edge for edge in self.edges}
		for edge in self.edges:
			self._connect(edge["fromNodeId"], edge["branch"], edge["toNodeId"])
		containers = [node for node in self.nodes.values() if node["kind"] == "group" and not node["parallel"]]
		orders = [self._children(node["id"]) for node in containers]
		orders.append(self._children(None, top_level=True))
		for children in orders:
			for source, target in zip(children, children[1:], strict=False):
				if (source["id"], target["id"]) in explicit:
					continue
				self._connect(source["id"], self._source_output(source["id"]), target["id"])


async def test_review_v71_runs_with_exact_branches_groups_and_output_bytes() -> None:
	run = _load_run()
	_assert_private_trace(run)
	review = ReviewGraph(run)
	await review.graph.process(fallback_to_env_vars=False)

	for node_id, node in review.nodes.items():
		vertex = review.graph.get_vertex(node_id)
		expected = review.outputs[node_id]
		if expected is None:
			assert vertex.built is False
			continue
		output_name = "trace" if node["kind"] == "gate" else "result"
		assert vertex.built_object[output_name].data == {"nodeId": node_id, "text": expected}
