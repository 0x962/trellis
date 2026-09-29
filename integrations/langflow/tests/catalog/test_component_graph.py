import hashlib
import json
import os
from pathlib import Path

import pytest
from lfx.custom import Component
from lfx.graph import Graph
from lfx.io import HandleInput, Output
from lfx.schema.data import Data

from integrations.langflow.components.catalog.nativeDecision import TrellisNativeDecisionV1
from integrations.langflow.components.catalog.orderedOutput import TrellisOrderedOutputV1

TRELLIS_ROOT = Path(os.environ["TRELLIS_ROOT"]).resolve()


class CatalogTraceSink(Component):
	display_name = "Catalog Trace Sink"
	inputs = [HandleInput(name="value", display_name="Value", input_types=["Data"], required=True)]
	outputs = [Output(name="out", display_name="Output", method="read", types=["Data"])]

	def read(self) -> Data:
		return self.value


class CatalogTraceSource(Component):
	display_name = "Catalog Trace Source"
	outputs = [Output(name="out", display_name="Output", method="read", types=["Data"])]

	def read(self) -> Data:
		return Data(data=self.record)


@pytest.mark.parametrize("answer,branch", [("YES\n", "yes"), ("  No\n", "no"), ("\ufeffYES\ufeff", "yes")])
async def test_native_result_keeps_its_identity_and_releases_one_branch(answer, branch):
	result = json.loads((TRELLIS_ROOT / "apps/server/src/langflowContracts/fixtures/native-result.json").read_text())
	result["output"] = answer
	result["outputHash"] = hashlib.sha256(answer.encode()).hexdigest()
	gate = TrellisNativeDecisionV1(_id="native-gate")
	gate.set(result=Data(data=result))
	yes = CatalogTraceSink(_id="yes-successor")
	yes.set(value=gate.yes)
	no = CatalogTraceSink(_id="no-successor")
	no.set(value=gate.no)
	graph = Graph()
	for component in (gate, yes, no):
		graph.add_component(component)
	await graph.process(fallback_to_env_vars=False)
	selected = graph.get_vertex(f"{branch}-successor")
	excluded = graph.get_vertex("no-successor" if branch == "yes" else "yes-successor")
	assert selected.built_object["out"].data == result
	assert excluded.built is False


@pytest.mark.parametrize("answer,exit_kind", [
	("YES because", "completed"), ("", "completed"), ("YES\nNO", "completed"),
	("YES", "timeout"), ("NO", "canceled"), ("YES", "process_error"), ("\x85YES", "completed"),
])
def test_native_gate_rejects_ambiguous_or_incomplete_results(answer, exit_kind):
	gate = TrellisNativeDecisionV1(_id="native-gate")
	gate.set(result=Data(data={"output": answer, "exitKind": exit_kind}))
	with pytest.raises(ValueError, match="native_gate_decision_unknown"):
		gate.yes()


async def test_engine_join_keeps_source_order_empty_text_and_output_references():
	first_record = {"nodeId": "first", "text": "", "outputSource": {"attemptId": "first-attempt"}}
	second_record = {"nodeId": "second", "text": "  Second\n", "outputSource": {"attemptId": "second-attempt"}}
	first = CatalogTraceSource(_id="first")
	first.record = first_record
	second = CatalogTraceSource(_id="second")
	second.record = second_record
	join = TrellisOrderedOutputV1(_id="join")
	join.set(items=[second.read, first.read], child_ids=json.dumps(["first", "second"]))
	graph = Graph()
	for component in (second, first, join):
		graph.add_component(component)
	await graph.process(fallback_to_env_vars=False)
	assert graph.get_vertex("join").built_object["out"].data == {
		"text": "\n\n  Second\n", "children": [first_record, second_record],
	}


@pytest.mark.parametrize("ids,items", [
	(["a", "b"], [{"nodeId": "a", "text": "A"}]),
	(["a"], [{"nodeId": "a", "text": "A"}, {"nodeId": "a", "text": "B"}]),
	(["a", "a"], [{"nodeId": "a", "text": "A"}]),
])
def test_join_refuses_missing_or_duplicate_children(ids, items):
	join = TrellisOrderedOutputV1(_id="join")
	join.set(items=[Data(data=item) for item in items], child_ids=json.dumps(ids))
	with pytest.raises(ValueError, match="group_output_identity_conflict"):
		join.collect()


@pytest.mark.parametrize("answer,branch", [("YES", "yes"), ("NO", "no")])
async def test_selected_output_clears_earlier_engine_exclusion(answer, branch):
	gate = TrellisNativeDecisionV1(_id="changing-gate")
	result = {"output": answer, "exitKind": "completed"}
	gate.set(result=Data(data=result))
	successor = CatalogTraceSink(_id="selected-successor")
	successor.set(value=getattr(gate, branch))
	graph = Graph(gate, successor)
	graph.exclude_branch_conditionally("changing-gate", output_name=branch)
	assert "selected-successor" in graph.conditionally_excluded_vertices
	await graph.process(fallback_to_env_vars=False)
	assert "selected-successor" not in graph.conditionally_excluded_vertices
	assert graph.get_vertex("selected-successor").built is True
	assert graph.get_vertex("selected-successor").results["out"].data == result
