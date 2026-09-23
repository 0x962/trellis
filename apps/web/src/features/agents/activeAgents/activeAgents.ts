import type { SessionStatus } from "@trellis/api";

// An agent that waits for an answer stays active, because the person must still act on it.
const activeStatuses: SessionStatus[] = ["starting", "working", "needs-input"];

export type ProjectAgentCount = { projectId: string; activeCount: number };

// The Sessions page of a project lists the runs that carry the id of that
// project, so a run counts for the one project its projectId names.
// The sort holds the order steady. React Query then finds the new array equal
// to the array from the previous fetch, keeps the old array, and the sidebar
// does not redraw.
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
