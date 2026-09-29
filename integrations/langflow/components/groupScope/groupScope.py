from lfx.custom import Component
from lfx.graph.group_scope import GroupScopeDefinition, GroupSettlement, open_group_scope, settle_group_child
from lfx.io import HandleInput, MultilineInput, Output
from lfx.schema.data import Data


class TrellisGroupScopeV1(Component):
	display_name = "Trellis Group Scope V1"
	description = "Opens one persisted group occurrence for its Langflow entries."
	name = "TrellisGroupScopeV1"
	inputs = [
		HandleInput(name="group_occurrence", display_name="Group Occurrence", input_types=["Data"], required=True),
		HandleInput(name="scope_context", display_name="Scope Context", input_types=["Data"], required=True),
		HandleInput(
			name="boundary_inputs", display_name="Boundary Inputs", input_types=["Data"], is_list=True, required=False,
		),
		MultilineInput(name="scope_definition", display_name="Scope Definition", required=True),
	]
	outputs = [Output(name="entries", display_name="Entries", method="open", types=["Data"])]

	def open(self) -> Data:
		definition = GroupScopeDefinition.model_validate_json(self.scope_definition)
		occurrence = self.group_occurrence.data
		open_group_scope(
			self.graph,
			definition,
			occurrence["occurrenceKey"],
			occurrence.get("loopVisitKey"),
			self.scope_context.data,
		)
		inputs = self.boundary_inputs if isinstance(self.boundary_inputs, list) else [self.boundary_inputs]
		return Data(data={
			"groupOccurrence": occurrence,
			"scope": self.scope_context.data,
			"boundaryInputs": [item.data for item in inputs if item is not None],
			"entryNodeIds": list(definition.entry_node_ids),
		})


class TrellisGroupSettlementV1(Component):
	display_name = "Trellis Group Settlement V1"
	description = "Retains one completed, skipped, or failed child result."
	name = "TrellisGroupSettlementV1"
	inputs = [
		HandleInput(name="scope_context", display_name="Scope Context", input_types=["Data"], required=True),
		HandleInput(name="result", display_name="Child Result", input_types=["Data"], required=True),
		MultilineInput(name="source_node_id", display_name="Source Node ID", required=True),
	]
	outputs = [Output(name="settlement", display_name="Settlement", method="settle", types=["Data"])]

	def settle(self) -> Data:
		occurrence = self.scope_context.data["groupOccurrence"]
		settlement = GroupSettlement.model_validate({"nodeId": self.source_node_id, **self.result.data})
		settle_group_child(self.graph, occurrence["occurrenceKey"], settlement)
		return Data(data=settlement.model_dump(by_alias=True))


class TrellisGroupOutputV1(Component):
	display_name = "Trellis Group Output V1"
	description = "Joins settled child bytes in source node order."
	name = "TrellisGroupOutputV1"
	inputs = [
		HandleInput(name="scope_context", display_name="Scope Context", input_types=["Data"], required=True),
		HandleInput(name="settlements", display_name="Settlements", input_types=["Data"], is_list=True, required=False),
	]
	outputs = [Output(name="out", display_name="Output", method="collect", types=["Data"])]

	async def collect(self) -> Data:
		occurrence = self.scope_context.data["groupOccurrence"]
		for item in self.settlements if isinstance(self.settlements, list) else [self.settlements]:
			if item is not None:
				settle_group_child(self.graph, occurrence["occurrenceKey"], GroupSettlement.model_validate(item.data))
		output = self.graph.group_scope_output(occurrence["occurrenceKey"])
		if occurrence.get("loopVisitKey") is not None:
			await self.graph.commit_trellis_loop_children(occurrence["loopVisitKey"], output)
		return Data(data=output)
