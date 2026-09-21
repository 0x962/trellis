import { type AgentRun, isAgentWorking, type ProjectSummary, type SessionDetail, sessionStatus } from "@trellis/api";

type SidebarRun = Pick<AgentRun, "kind" | "projectId" | "ticketEpicProjectId" | "processStatus" | "observation">;

type SidebarSession = Pick<SessionDetail, "projectId" | "run">;

export type SidebarWorkCounts = {
	projectRows: Map<string, number>;
	epicRows: Map<string, number>;
	projectSessionRows: Map<string, number>;
	projectSection: number;
	sessionSection: number;
};

const increment = (counts: Map<string, number>, key: string, amount = 1) => {
	counts.set(key, (counts.get(key) ?? 0) + amount);
};

const addProjectAndAncestors = (
	counts: Map<string, number>,
	parents: Map<string, string | null>,
	projectId: string,
) => {
	let cursor: string | null = projectId;
	while (cursor !== null) {
		increment(counts, cursor);
		cursor = parents.get(cursor) ?? null;
	}
};

export function sidebarWorkCounts(
	projects: readonly ProjectSummary[],
	runs: readonly SidebarRun[],
	sessions: readonly SidebarSession[],
): SidebarWorkCounts {
	const parents = new Map(projects.map((project) => [project.id, project.parentId] as const));
	const projectRows = new Map<string, number>();
	const epicRows = new Map<string, number>();
	const projectSessionRows = new Map<string, number>();
	let projectSection = 0;
	let sessionSection = 0;

	for (const run of runs) {
		if (run.kind !== "agent" || !isAgentWorking(run)) continue;
		if (run.projectId !== null) {
			projectSection += 1;
			addProjectAndAncestors(projectRows, parents, run.projectId);
			increment(projectSessionRows, run.projectId);
		}
		if (run.ticketEpicProjectId !== null) increment(epicRows, run.ticketEpicProjectId);
	}

	for (const session of sessions) {
		if (sessionStatus(session.run) !== "working") continue;
		if (session.projectId === null) {
			sessionSection += 1;
			continue;
		}
		projectSection += 1;
		addProjectAndAncestors(projectRows, parents, session.projectId);
		increment(projectSessionRows, session.projectId);
	}

	return { projectRows, epicRows, projectSessionRows, projectSection, sessionSection };
}
