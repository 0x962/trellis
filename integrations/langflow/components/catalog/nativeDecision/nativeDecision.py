from lfx.custom import Component
from lfx.io import HandleInput, Output
from lfx.schema.data import Data


ECMASCRIPT_WHITESPACE = (
	"\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680"
	"\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007"
	"\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"
)


class TrellisNativeDecisionV1(Component):
	display_name = "Trellis Native Decision V1"
	description = "Routes a completed native result by its YES or NO answer."
	name = "TrellisNativeDecisionV1"
	inputs = [
		HandleInput(name="result", display_name="Native Result", input_types=["Data"], required=True),
	]
	outputs = [
		Output(name="yes", display_name="Yes", method="yes", types=["Data"], group_outputs=True),
		Output(name="no", display_name="No", method="no", types=["Data"], group_outputs=True),
	]

	def _route(self, branch: str) -> Data:
		result = self.result.data
		answer = result["output"].strip(ECMASCRIPT_WHITESPACE).lower()
		if result["exitKind"] != "completed" or answer not in ("yes", "no"):
			raise ValueError("native_gate_decision_unknown")
		if answer != branch:
			self.stop(branch)
			self.graph.exclude_branch_conditionally(self._id, output_name=branch)
		return self.result

	def yes(self) -> Data:
		return self._route("yes")

	def no(self) -> Data:
		return self._route("no")
