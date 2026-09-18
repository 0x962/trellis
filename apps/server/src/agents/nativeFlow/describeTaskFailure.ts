import type { FlowDoc } from "@trellis/api";
import type { FlowExecution, FlowStep } from "./types.ts";

const processTimeout = /^Process timed out after \d+ ms$/;

// The runtime stops a flow worker only for the time limit of a box around
// its step: the server hands the earliest deadline of those boxes to the
// runtime as the process timeout, and nothing else sets one. The runtime
// reports the milliseconds, so the step records the box and its limit.
export function describeTaskFailure(doc: FlowDoc, state: FlowExecution, step: FlowStep, error: string): string {
	if (!processTimeout.test(error)) return error;
	let earliest: FlowStep | null = null;
	let parentKey = step.parentKey;
	while (parentKey !== null) {
		const parent = state.steps.find((candidate) => candidate.key === parentKey)!;
		if (parent.deadlineAt !== null && (earliest === null || parent.deadlineAt < earliest.deadlineAt!))
			earliest = parent;
		parentKey = parent.parentKey;
	}
	if (earliest === null) return error;
	const node = doc.nodes.find((candidate) => candidate.id === earliest.nodeId)!;
	return `Group ${node.title} reached its time limit (${node.minutes} min)`;
}
