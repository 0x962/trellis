import type { FlowDoc } from "@trellis/api";
import { flowInputs } from "./flowInputs.ts";
import { taskKey } from "./taskKey.ts";
import type { FlowAction, FlowExecution } from "./types.ts";
export function pendingFlowActions(doc: FlowDoc, state: FlowExecution): FlowAction[] {
	return state.steps
		.filter((step) => step.needsStop || step.state === "ready" || step.state === "waiting_human")
		.map((step) => {
			const node = doc.nodes.find((node) => node.id === step.nodeId)!;
			return {
				type: step.needsStop ? "cancel" : step.state === "waiting_human" ? "human" : "agent",
				key: taskKey(step),
				nodeId: node.id,
				purpose: step.phase === "condition" ? "loop-condition" : node.kind === "gate" ? "gate" : "step",
				instruction: node.instruction,
				personaId: node.personaId,
				inputs: flowInputs(doc, state, step),
			};
		});
}
