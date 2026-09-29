import type { FlowExecutionViewV1 } from "../schemas/flowExecutionViewV1.ts";

export type FlowReviewRun = Pick<FlowExecutionViewV1, "flowId" | "diffId" | "status">;

export type FlowReviewCredit = {
	diffId: string;
	hasTicket: boolean;
	applicableFlowIds: readonly string[];
	waived: boolean;
	runs: readonly FlowReviewRun[];
};

// The current flow catalog supplies applicableFlowIds. A deleted definition therefore loses its credit.
// One successful run answers for its diff across later pushes and later failed runs.
export const flowReviewCredit = (facts: FlowReviewCredit): boolean => {
	if (!facts.hasTicket || facts.applicableFlowIds.length === 0 || facts.waived) return true;
	const applicable = new Set(facts.applicableFlowIds);
	return facts.runs.some(
		(run) => run.diffId === facts.diffId && applicable.has(run.flowId) && run.status === "succeeded",
	);
};
