import type { SessionStatus } from "@trellis/api";

// An agent that waits for an answer stays active, because the person must still act on it.
const activeStatuses: SessionStatus[] = ["starting", "working", "needs-input"];

export type ProjectAgentCount = { projectId: string; activeCount: number };

// The Sessions page of a project lists the runs that carry the id of that
// project, and a run of a subproject stays on the page of the subproject. So a
// run counts for the one project its projectId names, and for no ancestor.
// The rows are sorted by project id, so two fetches with the same counts build
// the same array. React Query compares the new array with the last one and
// keeps the last one, so a project row redraws only when its own count changes.
export function activeAgentCounts(runs: { projectId: string | null; status: SessionStatus }[]): ProjectAgentCount[] {
	const counts = new Map<string, number>();
	for (const run of runs) {
		if (run.projectId === null || !activeStatuses.includes(run.status)) continue;
		counts.set(run.projectId, (counts.get(run.projectId) ?? 0) + 1);
	}
	return [...counts.entries()]
		.map(([projectId, activeCount]) => ({ projectId, activeCount }))
		.sort((a, b) => a.projectId.localeCompare(b.projectId));
}

export const activeAgentsLabel = (count: number) => (count === 1 ? "1 agent is active" : `${count} agents are active`);

export const activeAgentCountOf = (counts: ProjectAgentCount[], projectId: string): number =>
	counts.find((row) => row.projectId === projectId)?.activeCount ?? 0;
