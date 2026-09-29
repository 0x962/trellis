import json

from lfx.custom import Component
from lfx.io import HandleInput, MultilineInput, Output
from lfx.schema.data import Data


class TrellisOrderedOutputV1(Component):
	display_name = "Trellis Ordered Output V1"
	description = "Joins completed child outputs in source document order."
	name = "TrellisOrderedOutputV1"
	inputs = [
		HandleInput(name="items", display_name="Child Outputs", input_types=["Data"], is_list=True, required=True),
		MultilineInput(name="child_ids", display_name="Child IDs", required=True),
	]
	outputs = [Output(name="out", display_name="Output", method="collect", types=["Data"])]

	def collect(self) -> Data:
		child_ids = json.loads(self.child_ids)
		items = self.items if isinstance(self.items, list) else [self.items]
		by_id = {item.data["nodeId"]: item.data for item in items}
		if len(by_id) != len(items) or set(by_id) != set(child_ids) or len(set(child_ids)) != len(child_ids):
			raise ValueError("group_output_identity_conflict")
		ordered = [by_id[node_id] for node_id in child_ids]
		return Data(data={"text": "\n\n".join(item["text"] for item in ordered), "children": ordered})
