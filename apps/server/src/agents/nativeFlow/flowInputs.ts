import type { FlowDoc } from "@trellis/api";
import type { FlowExecution, FlowInput, FlowStep } from "./types.ts";
export function flowInputs(doc: FlowDoc, state: FlowExecution, step: FlowStep): FlowInput[] {
	const inputs: FlowInput[] = [];
	const add = (source: FlowStep) => {
		if (source.output !== null) inputs.push({ key: source.key, nodeId: source.nodeId, output: source.output });
	};
	const incoming = doc.edges.filter((edge) => edge.toNodeId === step.nodeId);
	for (const edge of incoming) {
		const source = state.steps.find(
			(source) =>
				source.nodeId === edge.fromNodeId && source.parentKey === step.parentKey && source.iteration === step.iteration,
		)!;
		if (source.state === "succeeded" && (edge.branch === "out" || source.decision === edge.branch)) add(source);
	}
	if (incoming.length === 0 && step.parentKey !== null) {
		const parent = state.steps.find((candidate) => candidate.key === step.parentKey)!;
		inputs.push(...flowInputs(doc, state, parent));
		if (step.iteration > 1) {
			for (const source of state.steps.filter(
				(source) =>
					source.parentKey === parent.key && source.iteration === step.iteration - 1 && source.state === "succeeded",
			))
				add(source);
			if (parent.output !== null)
				inputs.push({
					key: `${parent.key}:condition:${step.iteration - 1}`,
					nodeId: parent.nodeId,
					output: parent.output,
				});
		}
	}
	if (step.phase === "condition")
		for (const source of state.steps.filter(
			(source) => source.parentKey === step.key && source.iteration === step.round && source.state === "succeeded",
		))
			add(source);
	return [...new Map(inputs.map((input) => [input.key, input])).values()];
}
