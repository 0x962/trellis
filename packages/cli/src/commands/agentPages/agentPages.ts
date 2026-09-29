import { AGENT_RUN_LIST_MAX_LIMIT, type AgentRun, type AgentRunListRequest, type TrellisClient } from "@trellis/api";

type AgentPageQuery = Partial<Omit<AgentRunListRequest, "cursor" | "limit" | "includePinnedHistory">>;

export const agentPages = async function* (
	client: TrellisClient,
	query: AgentPageQuery,
	want: number,
): AsyncGenerator<AgentRun[]> {
	let cursor: string | undefined;
	let taken = 0;
	while (taken < want) {
		const page = await client.agentRuns.list({
			...query,
			cursor,
			limit: Math.min(want - taken, AGENT_RUN_LIST_MAX_LIMIT),
		});
		taken += page.items.length;
		yield page.items;
		if (page.nextCursor === null) return;
		cursor = page.nextCursor;
	}
};
