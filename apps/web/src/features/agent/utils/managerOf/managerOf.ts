import type { AgentSession } from "@trellis/api";

// The newest manager session of `projectId`, or undefined while the project
// has none. One manager serves a root and every project under it, so the
// caller passes the root's id.
export const managerOf = (sessions: AgentSession[], projectId: string): AgentSession | undefined =>
	sessions
		.filter((session) => session.role === "manager" && session.projectId === projectId)
		.reduce<AgentSession | undefined>(
			(best, session) => (best === undefined || session.createdAt > best.createdAt ? session : best),
			undefined,
		);
