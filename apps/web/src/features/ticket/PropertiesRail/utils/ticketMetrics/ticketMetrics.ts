import type { AgentRun } from "@trellis/api";

type RunMetrics = Pick<AgentRun, "metrics">;

export const ticketMetrics = (runs: RunMetrics[]) => {
	if (runs.length === 0) return { durationMs: 0, tokenCount: null };
	const durationMs = runs.every((run) => run.metrics.durationMs !== null)
		? runs.reduce((total, run) => total + run.metrics.durationMs!, 0)
		: null;
	const tokenCount = runs.every((run) => run.metrics.tokenCount !== null)
		? runs.reduce((total, run) => total + run.metrics.tokenCount!, 0)
		: null;
	return { durationMs, tokenCount };
};
