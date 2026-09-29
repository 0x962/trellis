import type { FlowExecutionRecord, FlowExecutionViewV1 } from "@trellis/api";

export type FlowRun = FlowExecutionRecord | FlowExecutionViewV1;

export const runProgress = (run: FlowRun) => {
	if ("schemaVersion" in run) {
		const human = run.detail === "waiting_human";
		return {
			status: run.status,
			failureKind: run.failureKind,
			error: run.error,
			name: run.snapshot.flow.name,
			head: run.reviewedHead,
			human,
			poll: run.status === "running" || (run.status === "waiting" && !human),
			detail: run.detail,
			failedStep: run.occurrences.find((step) => step.state === "failed"),
			humanStep: run.occurrences.find((step) => step.state === "waiting_human"),
		};
	}
	const stepWithTitle = (state: string) => {
		const step = run.state.steps.find((step) => step.state === state);
		return step === undefined
			? undefined
			: { ...step, title: run.doc.nodes.find((node) => node.id === step.nodeId)!.title };
	};
	return {
		status: run.state.status,
		failureKind: run.state.failureKind,
		error: run.state.error,
		name: run.doc.flow.name,
		head: run.headSha,
		human: run.state.status === "waiting",
		poll: run.state.status === "running",
		detail: null,
		failedStep: stepWithTitle("failed"),
		humanStep: stepWithTitle("waiting_human"),
	};
};
