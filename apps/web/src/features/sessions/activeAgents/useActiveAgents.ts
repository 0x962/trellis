import { useQuery } from "@tanstack/react-query";
import { type AgentActivity, sessionStatus } from "@trellis/api";
import { useApp } from "../../../lib/appContext";
import { activeAgentCounts } from "./activeAgents";

const select = (entries: AgentActivity[]) =>
	activeAgentCounts(entries.map(({ run }) => ({ projectId: run.projectId, status: sessionStatus(run) })));

// Every project row in the sidebar calls this hook, and they all read the one
// agentRuns.activity query, so the sidebar sends one request per interval
// however many projects it draws.
export function useActiveAgentCount(projectId: string): number {
	const { orpc } = useApp();
	const { data } = useQuery({
		...orpc.agentRuns.activity.queryOptions({ input: {} }),
		refetchInterval: 2000,
		select,
	});
	return data?.find((row) => row.projectId === projectId)?.activeCount ?? 0;
}
