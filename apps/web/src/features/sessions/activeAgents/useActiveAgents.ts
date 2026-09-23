import { useQuery } from "@tanstack/react-query";
import { type AgentActivity, sessionStatus } from "@trellis/api";
import { useApp } from "../../../lib/appContext";
import { activeAgentCounts, type ProjectAgentCount } from "./activeAgents";

const select = (entries: AgentActivity[]) =>
	activeAgentCounts(entries.map(({ run }) => ({ projectId: run.projectId, status: sessionStatus(run) })));

// One count per project that has an agent which starts, works or waits for an
// answer. The sidebar calls this once and reads the count of each project row
// out of the array, so it sends one request per interval however many
// projects it draws.
export function useActiveAgentCounts(): ProjectAgentCount[] {
	const { orpc } = useApp();
	const { data } = useQuery({
		...orpc.agentRuns.activity.queryOptions({ input: {} }),
		refetchInterval: 2000,
		select,
	});
	return data ?? [];
}

export const activeAgentsOf = (counts: ProjectAgentCount[], projectId: string): number =>
	counts.find((row) => row.projectId === projectId)?.activeCount ?? 0;
