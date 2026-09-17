import type { TicketMetrics } from "@trellis/api";

type RunMetrics = Pick<TicketMetrics, "durationMs" | "tokenCount">;

export const aggregateTicketMetrics = (runs: RunMetrics[], ageMs: number): TicketMetrics => {
	if (runs.length === 0) return { durationMs: 0, tokenCount: null, ageMs };
	const durationMs = runs.every((run) => run.durationMs !== null)
		? runs.reduce((total, run) => total + run.durationMs!, 0)
		: null;
	const tokenCount = runs.every((run) => run.tokenCount !== null)
		? runs.reduce((total, run) => total + run.tokenCount!, 0)
		: null;
	return { durationMs, tokenCount, ageMs };
};
