import type { FlowDoc, FlowExecutionRecord } from "@trellis/api";

type State = Omit<FlowExecutionRecord["state"], "steps"> & {
	steps: Omit<FlowExecutionRecord["state"]["steps"][number], "actionKey">[];
};

export const failureKind = (state: State, doc: FlowDoc): "error" | "feedback" | undefined => {
	if (state.status !== "failed") return undefined;
	if (state.failureKind !== undefined) return state.failureKind;
	const feedback = state.steps.some((step) => {
		if (step.state !== "failed") return false;
		const node = doc.nodes.find((node) => node.id === step.nodeId)!;
		return node.kind === "human" || (node.kind === "loop" && step.phase === "condition" && step.decision === "no");
	});
	return feedback ? "feedback" : "error";
};
