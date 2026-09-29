from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

SOURCE_ROOT = Path(os.environ["LANGFLOW_SOURCE_ROOT"]).resolve()
sys.path.insert(0, str(SOURCE_ROOT / "src" / "backend"))

from lfx.components.flow_controls.loop import LoopComponent
from lfx.components.processing.parser import ParserComponent
from lfx.custom.custom_component.component import Component
from lfx.graph import Graph
from lfx.schema.data import Data
from lfx.schema.dataframe import DataFrame
from lfx.template.field.base import Output


def _attach_feedback(loop: LoopComponent, source: Component, source_output: str) -> None:
	loop._edges.append(
		{
			"source": source.get_id(),
			"target": loop.get_id(),
			"data": {
				"sourceHandle": {
					"dataType": type(source).__name__,
					"id": source.get_id(),
					"name": source_output,
					"output_types": ["Message"],
				},
				"targetHandle": {
					"dataType": "LoopComponent",
					"id": loop.get_id(),
					"name": "item",
					"output_types": ["Data", "Message"],
				},
			},
		}
	)
	if source not in loop._components:
		loop._components.append(source)


class DeadlineProbe(Component):
	display_name = "Deadline Probe"
	outputs = [Output(display_name="Deadline", name="deadline", method="run", types=["Data"])]

	def run(self) -> Data:
		launched_at = datetime.fromisoformat(self.launched_at)
		deadline_at = launched_at + timedelta(milliseconds=self.budget_ms)
		return Data(
			data={
				"launchedAt": launched_at.isoformat(),
				"deadlineAt": deadline_at.isoformat(),
				"warningAt": [
					(launched_at + timedelta(milliseconds=self.budget_ms / 2)).isoformat(),
					(launched_at + timedelta(milliseconds=self.budget_ms * 3 / 4)).isoformat(),
				],
			}
		)


async def test_nested_stock_loops_run_child_before_each_feedback() -> None:
	outer = LoopComponent(_id="outer")
	outer.set(data=DataFrame([Data(text="outer-1"), Data(text="outer-2")]))
	inner = LoopComponent(_id="inner")
	inner.set(data=outer.item_output)
	inner_sink = ParserComponent(_id="inner-feedback")
	inner_sink.set(input_data=inner.item_output, mode="Parser", pattern="{text}", sep="\n")
	_attach_feedback(inner, inner_sink, "parsed_text")
	outer_sink = ParserComponent(_id="outer-feedback")
	outer_sink.set(input_data=inner.done_output, mode="Parser", pattern="{text}", sep="\n")
	_attach_feedback(outer, outer_sink, "parsed_text")

	graph = Graph(outer, outer_sink)
	[r async for r in graph.async_start()]

	assert [item.text for item in outer.ctx["outer_aggregated"]] == ["outer-1", "outer-2"]
	assert outer.ctx["outer_index"] == 2


async def test_real_graph_deadline_uses_first_launch_and_unbounded_budget() -> None:
	reserved_at = datetime(2026, 9, 29, 5, 0, tzinfo=timezone.utc)
	launched_at = datetime(2026, 9, 29, 6, 0, tzinfo=timezone.utc)
	receipt_at = datetime(2026, 9, 29, 6, 5, tzinfo=timezone.utc)
	budget_ms = 1_441 * 60_000
	probe = DeadlineProbe(_id="deadline")
	probe.launched_at = launched_at.isoformat()
	probe.budget_ms = budget_ms
	graph = Graph()
	graph.add_component(probe)
	await graph.process(fallback_to_env_vars=False, start_component_id=probe.get_id())

	result = graph.get_vertex("deadline").built_object["deadline"].data
	deadline_at = datetime.fromisoformat(result["deadlineAt"])
	assert deadline_at == launched_at + timedelta(milliseconds=budget_ms)
	assert deadline_at != reserved_at + timedelta(milliseconds=budget_ms)
	assert deadline_at != receipt_at + timedelta(milliseconds=budget_ms)
	assert [datetime.fromisoformat(value) for value in result["warningAt"]] == [
		launched_at + timedelta(milliseconds=budget_ms / 2),
		launched_at + timedelta(milliseconds=budget_ms * 3 / 4),
	]
