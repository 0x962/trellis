import { AGENT_RUN_LIST_MAX_LIMIT, type AgentRun, type AgentRunListRequest, type TrellisClient } from "@trellis/api";
import type { Orpc } from "../../../lib/orpc";

export const allAgentRuns = async (client: TrellisClient, input: AgentRunListRequest): Promise<AgentRun[]> => {
	const items: AgentRun[] = [];
	let cursor: string | undefined;
	do {
		const page = await client.agentRuns.list({
			...input,
			limit: input.limit ?? AGENT_RUN_LIST_MAX_LIMIT,
			cursor,
		});
		items.push(...page.items);
		cursor = page.nextCursor ?? undefined;
	} while (cursor !== undefined);
	return items;
};

export const allAgentRunsOptions = (orpc: Orpc, client: TrellisClient, input: AgentRunListRequest) => ({
	...orpc.agentRuns.list.queryOptions({ input }),
	queryFn: () => allAgentRuns(client, input),
});
