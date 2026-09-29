import type { FlowExecutionRecord, FlowExecutionViewV1 } from "@trellis/api";

export function decisionView(execution: FlowExecutionRecord | FlowExecutionViewV1, actionKey: string) {
	if ("schemaVersion" in execution) {
		const step = execution.occurrences.find((item) => item.actionKey === actionKey);
		return {
			title: step?.title ?? "Decision unavailable",
			instruction: step?.instruction ?? "The selected step is absent from this run.",
			waiting: step?.state === "waiting_human" && step.waitReason === "human",
			delivery: execution.decisionDeliveries.find((item) => item.actionKey === actionKey),
			outputs: execution.occurrences
				.filter((item) => item.state === "succeeded" && item.output !== null)
				.map((item) => ({ key: item.occurrenceKey, title: item.title, text: item.output! })),
		};
	}
	const nodes = new Map(execution.doc.nodes.map((node) => [node.id, node]));
	const step = execution.state.steps.find((item) => item.actionKey === actionKey);
	const node = step ? nodes.get(step.nodeId) : undefined;
	return {
		title: node?.title ?? "Decision unavailable",
		instruction: node?.instruction ?? "The selected step is absent from this run.",
		waiting: step?.state === "waiting_human",
		delivery: undefined,
		outputs: execution.state.steps
			.filter((item) => item.state === "succeeded" && item.output !== null)
			.map((item) => ({
				key: item.key,
				title: nodes.get(item.nodeId)!.title,
				text: item.output!,
			})),
	};
}
