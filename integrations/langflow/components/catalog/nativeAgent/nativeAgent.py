from langflow.services.trellis_v1.occurrence_outputs import component_output, record_visit_output
from langflow.services.trellis_v1.occurrence_requests import run_native_visit
from langflow.services.trellis_v1.occurrence_scope import capture_visit_scope
from lfx.custom import Component
from lfx.io import HandleInput, Output
from lfx.schema.data import Data


class TrellisNativeAgentV1(Component):
	display_name = "Trellis Native Agent V1"
	description = "Runs the native attempt for the current engine visit."
	name = "TrellisNativeAgentV1"
	inputs = [HandleInput(name="inputs", display_name="Inputs", input_types=["Data"], is_list=True)]
	outputs = [Output(name="result", display_name="Native Result", method="run", types=["Data"])]

	async def run(self) -> Data:
		scope = await capture_visit_scope(self.graph, self._vertex.id)
		result = await run_native_visit(self.graph, self._vertex.id, scope)
		receipt = await record_visit_output(self.graph, self._vertex.id, scope, result)
		state = {"completed": "succeeded", "process_error": "failed", "timeout": "failed", "canceled": "canceled"}[result["exitKind"]]
		return Data(data={**result, **component_output(receipt, state)})
