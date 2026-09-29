from __future__ import annotations

import json

from lfx.custom import Component
from lfx.io import MultilineInput, Output
from lfx.schema.message import Message


class TrellisExternalWaitComponent(Component):
    display_name = "Trellis External Wait"
    description = "Waits for one exact Trellis completion receipt."
    icon = "pause"

    inputs = [MultilineInput(name="wait_bytes", display_name="Wait Bytes", required=True)]
    outputs = [Output(display_name="Receipt", name="receipt", method="wait")]

    async def wait(self) -> Message:
        wait = json.loads(self.wait_bytes)
        if wait["kind"] == "human":
            request_id = wait["request"]["engineRequestId"]
            decisions = getattr(self.graph, "human_input_decisions", {})
            decision = decisions.get(request_id)
            if decision is not None:
                decision_bytes = json.dumps(decision, separators=(",", ":"))
                receipt_bytes = await self.graph.complete_external_wait(self.wait_bytes, decision_bytes)
                return Message(text=receipt_bytes)
        receipt_bytes = await self.graph.await_external_completion(self.wait_bytes)
        return Message(text=receipt_bytes)
