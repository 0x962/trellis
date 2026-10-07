import type { TrellisClient } from "@trellis/api";
import type { Orpc } from "../../../lib/orpc";
import { allAgentRuns } from "../allAgentRuns";

export const assignedAgentRunsOptions = (orpc: Orpc, client: TrellisClient) => ({
	...orpc.agentRuns.list.queryOptions({ input: { assigned: true } }),
	queryFn: async () => ({ items: await allAgentRuns(client, { assigned: true }), nextCursor: null }),
});
