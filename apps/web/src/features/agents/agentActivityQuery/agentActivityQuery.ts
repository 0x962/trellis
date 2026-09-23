import type { Orpc } from "../../../lib/orpc";

// The query that carries every live agent run: the runs of the sessions and
// the runs of the ticket agents. Each reader spreads this and adds its own
// select. They share one key, so React Query fetches once at this interval
// however many readers the page holds.
export const agentActivityQuery = (orpc: Orpc) => ({
	...orpc.agentRuns.activity.queryOptions({ input: {} }),
	refetchInterval: 2000,
});
