from langflow.services.trellis_v1.occurrence_outputs import component_output, record_visit_output
from langflow.services.trellis_v1.occurrence_requests import run_human_visit
from langflow.services.trellis_v1.occurrence_scope import capture_visit_scope
from lfx.custom import Component
from lfx.io import HandleInput, Output
from lfx.schema.data import Data


class TrellisHumanDecisionV1(Component):
	display_name = "Trellis Human Decision V1"
	description = "Retains the human decision for the current engine visit."
	name = "TrellisHumanDecisionV1"
	inputs = [HandleInput(name="inputs", display_name="Inputs", input_types=["Data"], is_list=True)]
	outputs = [Output(name="result", display_name="Decision", method="wait", types=["Data"])]

	async def wait(self) -> Data:
		scope = await capture_visit_scope(self.graph, self._vertex.id)
		policy = self.graph.trellis_current_loop_policy()
		condition = policy is not None and policy["phase"] == "condition"
		decision = await run_human_visit(
			self.graph, self._vertex.id, scope,
			max_rounds=None if policy is None else policy["maxRounds"], loop_condition=condition,
		)
		receipt = await record_visit_output(self.graph, self._vertex.id, scope, decision, human=True)
		metadata = component_output(receipt, "succeeded")
		if condition:
			return Data(data={"exitKind": "completed", "output": "YES" if decision["approved"] else "NO",
			                  "decision": decision, **metadata})
		return Data(data={**decision, **metadata})
