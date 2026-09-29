from langflow.services.trellis_v1.occurrence_outputs import component_output
from langflow.services.trellis_v1.occurrence_scope import capture_visit_scope
from langflow.services.trellis_v1.review_gate_operation import run_review_visit
from lfx.custom import Component
from lfx.io import HandleInput, Output
from lfx.schema.data import Data


class TrellisReviewGateV1(Component):
    display_name = "Trellis Review Gate V1"
    description = "Routes the current review visit from its saved classification."
    name = "TrellisReviewGateV1"
    inputs = [HandleInput(name="inputs", display_name="Inputs", input_types=["Data"], is_list=True)]
    outputs = [
        Output(name="yes", display_name="Yes", method="yes", types=["Data"], group_outputs=True),
        Output(name="no", display_name="No", method="no", types=["Data"], group_outputs=True),
    ]

    async def _route(self) -> Data:
        scope = await capture_visit_scope(self.graph, self._vertex.id)
        value = await run_review_visit(self.graph, self._vertex.id, scope)
        rejected = "no" if value["branch"] == "yes" else "yes"
        self.stop(rejected)
        self.graph.exclude_branch_conditionally(self._vertex.id, output_name=rejected)
        return Data(data={**value["response"], "output": value["output"],
                          **component_output(value["receipt"], "succeeded")})

    async def yes(self) -> Data:
        return await self._route()

    async def no(self) -> Data:
        return await self._route()
