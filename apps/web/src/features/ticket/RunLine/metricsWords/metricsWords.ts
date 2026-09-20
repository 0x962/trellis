import type { TicketMetrics } from "@trellis/api";
import { formatCount, formatDuration } from "../../../../lib/format";

// `TicketMetrics` in the properties rail prints the same two numbers.
export const metricsWords = (metrics: TicketMetrics | null) => {
	if (metrics === null) return "The time and the tokens are not counted.";
	const time = metrics.durationMs === null ? "no time" : formatDuration(metrics.durationMs);
	const tokens = metrics.tokenCount === null ? "no tokens" : `${formatCount(metrics.tokenCount)} tokens`;
	return `${time} burned · ${tokens}`;
};
