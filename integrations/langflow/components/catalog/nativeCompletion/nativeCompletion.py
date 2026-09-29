import json

from langflow.services.deps import get_job_service
from langflow.services.trellis_v1.external_waits import TrellisExternalWaitBroker
from lfx.custom import Component
from lfx.io import MultilineInput, Output
from lfx.schema.data import Data


class TrellisNativeCompletionV1(Component):
	display_name = "Trellis Native Completion V1"
	description = "Waits for the saved result of one exact native attempt."
	name = "TrellisNativeCompletionV1"
	inputs = [MultilineInput(name="wait_bytes", display_name="Native Wait Bytes", required=True)]
	outputs = [Output(name="result", display_name="Native Result", method="wait_result", types=["Data"])]

	async def wait_result(self) -> Data:
		wait = json.loads(self.wait_bytes)
		if wait["kind"] != "native" or wait["request"]["engineJobId"] != self.graph.job_id:
			raise ValueError("native_wait_binding_conflict")
		await self.graph.await_external_completion(self.wait_bytes)
		delivery_bytes = await TrellisExternalWaitBroker(get_job_service()).delivery_for(self.graph, self.wait_bytes)
		if delivery_bytes is None:
			raise ValueError("native_completion_unavailable")
		return Data(data=json.loads(delivery_bytes)["result"])
