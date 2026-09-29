import type { FlowExecutionIdentityV1 } from "@trellis/api";
import { type FlowRun, runProgress } from "../runProgress/runProgress.ts";

export type ListedRun = FlowRun | FlowExecutionIdentityV1;

export const runRow = (run: ListedRun) => {
	if ("pendingSubmission" in run)
		return { name: run.flowId, status: run.status ?? "unknown", head: null, createdAt: null, diffId: null };
	const progress = runProgress(run);
	return {
		name: progress.name,
		status: progress.status,
		head: progress.head,
		createdAt: run.createdAt,
		diffId: run.diffId,
	};
};
