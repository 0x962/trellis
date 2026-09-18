import type { FlowDoc } from "@trellis/api";
import { boxClocks } from "./boxClocks.ts";
import type { FlowExecution, FlowStep } from "./types.ts";

const processTimeout = /^Process timed out after \d+ ms$/;

// The runtime stops a flow worker only for the time limit of a box around
// its step: the server hands the earliest deadline of those boxes to the
// runtime as the process timeout, and nothing else sets one. The runtime
// reports the milliseconds, so the step records the box and its limit.
export function describeTaskFailure(doc: FlowDoc, state: FlowExecution, step: FlowStep, error: string): string {
	if (!processTimeout.test(error)) return error;
	const running = boxClocks(doc, state, step).filter((clock) => clock.deadlineAt !== null);
	if (running.length === 0) return error;
	const { box } = running.reduce((first, next) => (next.deadlineAt! < first.deadlineAt! ? next : first));
	return `Group ${box.title} reached its time limit (${box.minutes} min)`;
}
