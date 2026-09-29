from lfx.base.flow_controls.loop_utils import (
	execute_loop_body,
	extract_loop_output,
	get_loop_body_start_edge,
	get_loop_body_start_vertex,
	get_loop_body_vertices,
)
from langflow.services.trellis_v1.occurrence_models import VisitScope
from langflow.services.trellis_v1.occurrence_outputs import component_output, record_control_output
from langflow.services.trellis_v1.occurrence_scope import capture_visit_scope
from lfx.custom import Component
from lfx.io import HandleInput, IntInput, Output
from lfx.schema.data import Data


class TrellisLoopV1(Component):
	display_name = "Trellis Loop V1"
	description = "Runs child nodes before one native condition for each loop round."
	name = "TrellisLoopV1"
	inputs = [
		HandleInput(name="seed", display_name="Selected Inputs", input_types=["Data"], required=True),
		IntInput(name="max_rounds", display_name="Maximum Rounds", required=True),
	]
	outputs = [
		Output(
			name="children",
			display_name="Children",
			method="run_children",
			types=["Data"],
			allows_loop=True,
			group_outputs=True,
		),
		Output(name="done", display_name="Done", method="finish", types=["Data"], group_outputs=True),
	]

	async def _visit(self) -> dict:
		scope_value = getattr(self, "_trellis_inherited_scope", None)
		if scope_value is None:
			scope = await capture_visit_scope(self.graph, self._vertex.id)
			scope_value = scope.to_engine()
			self._trellis_inherited_scope = scope_value
		visit = await self.graph.begin_trellis_loop_visit(
			loop_node_id=self._id,
			max_rounds=self.max_rounds,
			selected_inputs=self.seed.data,
			selected_input_bytes=self.seed.get_text(),
			inherited_scope=scope_value,
		)
		return visit

	async def _output(self, port: str, visit: dict) -> Data:
		context = self.graph.trellis_loop_output_context(visit["visitKey"], port)
		receipt = await record_control_output(
			self.graph,
			self._vertex.id,
			VisitScope.from_engine(context["scope"]),
			context["occurrence"],
			port,
			visit,
			output=context["output"],
		)
		return Data(data={**visit, **component_output(receipt, "succeeded")})

	def _body_vertices(self) -> set[str]:
		return get_loop_body_vertices(
			vertex=self._vertex,
			graph=self.graph,
			get_incoming_edge_by_target_param_fn=self.get_incoming_edge_by_target_param,
		)

	async def _execute(self) -> dict:
		cached = self.ctx.get(f"{self._id}_completed_visit")
		if cached is not None:
			return cached
		visit = await self._visit()
		if visit["phase"] == "failed":
			raise RuntimeError("loop_rounds_exhausted")
		start_vertex_id = get_loop_body_start_vertex(vertex=self._vertex)
		start_edge = get_loop_body_start_edge(self._vertex)
		end_vertex_id = self.get_incoming_edge_by_target_param("children")
		while visit["phase"] != "completed":
			self.graph.trellis_loop_active_visit_key = visit["visitKey"]
			payload = Data(
				data={
					"visitKey": visit["visitKey"],
					"visitOccurrenceKey": visit["visitOccurrenceKey"],
					"iterationPath": visit["iterationPath"],
					"selectedInputs": visit["selectedInputs"],
					"priorOutputs": visit["priorOutputs"],
					"feedbackBytes": visit["feedbackBytes"],
				}
			)
			results = await execute_loop_body(
				graph=self.graph,
				data_list=[payload],
				loop_body_vertex_ids=self._body_vertices(),
				start_vertex_id=start_vertex_id,
				start_edge=start_edge,
				end_vertex_id=end_vertex_id,
				event_manager=self._event_manager,
			)
			condition = extract_loop_output(results=results, end_vertex_id=end_vertex_id)
			visit = await self.graph.commit_trellis_loop_condition(visit["visitKey"], condition.data)
		self.update_ctx({f"{self._id}_completed_visit": visit})
		return visit

	async def run_children(self) -> Data:
		self.stop("children")
		if self._vertex is not None and "done" not in self._vertex.edges_source_names:
			await self._execute()
		visit = await self._visit()
		return await self._output("children", visit)

	async def finish(self) -> Data:
		visit = await self._execute()
		return await self._output("done", visit)
