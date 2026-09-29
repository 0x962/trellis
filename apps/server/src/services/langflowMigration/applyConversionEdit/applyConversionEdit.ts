import type { FlowDoc } from "@trellis/api";
import type { ConversionEditIntentV1 } from "../conversionEditIntent";
import { inspectSource } from "../inspectSource";

export const applyConversionEdit = (source: FlowDoc, intent: ConversionEditIntentV1): FlowDoc => {
	const edited = structuredClone(source);
	if (source.flow.id !== intent.flowId) throw new Error("conversion_edit_flow_conflict");
	for (const edit of intent.edits) {
		if (edit.kind === "set-flow-briefing") {
			edited.flow.briefing = edit.briefing;
			continue;
		}
		if (edit.kind === "set-flow-harness") {
			edited.flow.harness = edit.harness;
			continue;
		}
		const nodes = edited.nodes.filter((node) => node.id === edit.sourceNodeId);
		if (nodes.length !== 1) throw new Error("conversion_edit_node_conflict");
		const node = nodes[0]!;
		switch (edit.kind) {
			case "set-node-instruction":
				node.instruction = edit.instruction;
				break;
			case "set-node-harness":
				node.harness = edit.harness;
				break;
			case "set-group-policy":
				if (node.kind !== "group") throw new Error("conversion_edit_group_required");
				node.parallel = edit.parallel;
				node.minutes = edit.minutes;
				break;
			case "set-loop-rounds":
				if (node.kind !== "loop") throw new Error("conversion_edit_loop_required");
				node.maxRounds = edit.maxRounds;
				break;
		}
	}
	const checked = inspectSource(edited);
	if (checked.manifest === null || checked.diagnostics.length > 0) throw new Error("conversion_edited_source_invalid");
	return edited;
};
