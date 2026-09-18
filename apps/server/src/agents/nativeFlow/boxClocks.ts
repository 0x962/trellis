import type { FlowDoc, FlowNode } from "@trellis/api";
import type { FlowExecution, FlowStep } from "./types.ts";

export type BoxClock = {
	box: FlowNode;
	budgetMs: number;
	// The moment the limit ends. null until the first worker process inside
	// the box starts, which is when advanceFlow starts the clock of the box.
	deadlineAt: number | null;
};

// The time limits around a step, innermost box first. Only a box with
// `minutes` appears. The runtime stops the worker of the step at the
// earliest deadline among these clocks, or after the shortest budget when
// no clock runs yet.
export function boxClocks(doc: FlowDoc, state: FlowExecution, step: FlowStep): BoxClock[] {
	const clocks: BoxClock[] = [];
	let parentKey = step.parentKey;
	while (parentKey !== null) {
		const parent = state.steps.find((candidate) => candidate.key === parentKey)!;
		const box = doc.nodes.find((node) => node.id === parent.nodeId)!;
		if (box.minutes !== null) clocks.push({ box, budgetMs: box.minutes * 60000, deadlineAt: parent.deadlineAt });
		parentKey = parent.parentKey;
	}
	return clocks;
}

// The two numbers nativeStart turns into the process timeout: the earliest
// deadline among the clocks that run, and the shortest budget among the
// clocks that start with this launch. nativeStart takes the smaller time.
export const processLimit = (clocks: readonly BoxClock[]) => {
	let deadlineAt: number | undefined;
	let budgetMs: number | undefined;
	for (const clock of clocks) {
		if (clock.deadlineAt !== null) deadlineAt = Math.min(deadlineAt ?? Infinity, clock.deadlineAt);
		else budgetMs = Math.min(budgetMs ?? Infinity, clock.budgetMs);
	}
	return { deadlineAt, budgetMs };
};
