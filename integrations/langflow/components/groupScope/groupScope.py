from lfx.custom import Component
from lfx.graph.group_scope import GroupScopeDefinition, GroupSettlement, open_group_scope, settle_group_child
from lfx.io import HandleInput, MultilineInput, Output
from lfx.schema.data import Data
from langflow.services.trellis_v1.occurrence_controls import allocate_control_visit
from langflow.services.trellis_v1.occurrence_models import VisitScope
from langflow.services.trellis_v1.occurrence_outputs import component_output, record_control_output
from langflow.services.trellis_v1.occurrence_scope import capture_visit_scope


class TrellisGroupScopeV1(Component):
	display_name = "Trellis Group Scope V1"
	description = "Opens one persisted group occurrence for its Langflow entries."
	name = "TrellisGroupScopeV1"
	inputs = [
		HandleInput(
			name="boundary_inputs", display_name="Boundary Inputs", input_types=["Data"], is_list=True, required=False,
		),
		MultilineInput(name="scope_definition", display_name="Scope Definition", required=True),
	]
	outputs = [Output(name="entries", display_name="Entries", method="open", types=["Data"])]

	async def open(self) -> Data:
		definition = GroupScopeDefinition.model_validate_json(self.scope_definition)
		if definition.minutes is not None:
			raise RuntimeError("group_deadline_reservation_required")
		vertex_id = self._vertex.id
		scope = await capture_visit_scope(self.graph, vertex_id)
		occurrence = await allocate_control_visit(self.graph, vertex_id, scope, definition.group_node_id)
		loop_policy = self.graph.trellis_current_loop_policy()
		loop_visit_key = None if loop_policy is None else loop_policy["visitKey"]
		self.graph.activate_group_occurrence(
			vertex_id, occurrence, loop_visit_key, scope.to_engine(),
		)
		open_group_scope(self.graph, definition)
		inputs = self.boundary_inputs if isinstance(self.boundary_inputs, list) else [self.boundary_inputs]
		result = {
			"boundaryInputs": [item.data for item in inputs if item is not None],
			"entryNodeIds": list(definition.entry_node_ids),
		}
		output = "\n\n".join(item.data["trellisOutput"]["outputBytes"] for item in inputs if item is not None)
		receipt = await record_control_output(
			self.graph, vertex_id, scope, occurrence, "entries", result, output=output,
		)
		return Data(data={**result, **component_output(receipt, "succeeded")})


class TrellisGroupSettlementV1(Component):
	display_name = "Trellis Group Settlement V1"
	description = "Retains one completed, skipped, or failed child result."
	name = "TrellisGroupSettlementV1"
	inputs = [
		HandleInput(name="result", display_name="Child Result", input_types=["Data"], required=True),
		MultilineInput(name="source_node_id", display_name="Source Node ID", required=True),
	]
	outputs = [Output(name="settlement", display_name="Settlement", method="settle", types=["Data"])]

	def settle(self) -> Data:
		occurrence_key = self.graph.current_group_occurrence(self._vertex.id)
		result = self.result.data["trellisOutput"]
		settlement = GroupSettlement.model_validate({
			"nodeId": self.source_node_id,
			"occurrenceKey": result["occurrenceKey"],
			"state": "completed" if result["state"] == "succeeded" else "failed",
			"outputBytes": result["outputBytes"],
			"receiptId": result["receiptId"],
		})
		settle_group_child(self.graph, occurrence_key, settlement)
		return Data(data=settlement.model_dump(by_alias=True))


class TrellisGroupOutputV1(Component):
	display_name = "Trellis Group Output V1"
	description = "Joins settled child bytes in source node order."
	name = "TrellisGroupOutputV1"
	inputs = [
		HandleInput(name="settlements", display_name="Settlements", input_types=["Data"], is_list=True, required=False),
	]
	outputs = [Output(name="out", display_name="Output", method="collect", types=["Data"])]

	async def collect(self) -> Data:
		vertex_id = self._vertex.id
		occurrence_key = self.graph.current_group_occurrence(vertex_id)
		visit = self.graph.group_scope_visit(occurrence_key)
		for item in self.settlements if isinstance(self.settlements, list) else [self.settlements]:
			if item is not None:
				settle_group_child(self.graph, occurrence_key, GroupSettlement.model_validate(item.data))
		output = self.graph.group_scope_output(occurrence_key)
		receipt = await record_control_output(
			self.graph, vertex_id, VisitScope.from_engine(visit["scope"]), visit["occurrence"], "out", output,
			output=output["outputBytes"],
		)
		loop_visit_key = visit["loopVisitKey"]
		if loop_visit_key is not None:
			await self.graph.commit_trellis_loop_children(loop_visit_key, output)
		return Data(data={
			**output,
			**component_output(receipt, "succeeded"),
		})
