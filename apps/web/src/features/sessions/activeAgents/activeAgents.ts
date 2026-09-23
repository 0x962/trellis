import type { SessionStatus } from "@trellis/api";

// An agent is active while it can still move on its own or while it waits for
// an answer from the person: it starts up, it works, or it asks a question. An
// idle, finished, failed or unreachable agent is not active.
const activeStatuses: SessionStatus[] = ["starting", "working", "needs-input"];

export type ProjectAgentCount = { projectId: string; activeCount: number };

// The Sessions page of a project lists the runs that carry the id of that
// project, and a run of a subproject stays on the page of the subproject. So a
// run counts for the one project its projectId names, and for no ancestor.
// The rows come back sorted by project id, which keeps the array of one set of
// counts equal to the array before it, so a project row redraws only when its
// own count changes.
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
