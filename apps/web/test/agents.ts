import type { AgentProjectSettings, AgentSession } from "@trellis/api";
import type { FakeServer } from "./fake-server";
import { findTicket, isoNow, newId } from "./fake-server/state";

// The id of the root project with `key`.
export const rootId = (server: FakeServer, key = "CDE") =>
	[...server.state.projects.values()].find((project) => project.parentId === null && project.key === key)!.id;

// One settings row with the manager on and the contract defaults.
export const projectRow = (projectId: string, overrides: Partial<AgentProjectSettings> = {}): AgentProjectSettings => ({
	projectId,
	enabled: true,
	supersetProjectId: null,
	baseBranch: "main",
	maxConcurrent: 3,
	removeWorkspaceOnDone: true,
	...overrides,
});

// Turns agents on and the manager of `key` on, with `overrides` on its row.
export const enableAgents = (server: FakeServer, key = "CDE", overrides: Partial<AgentProjectSettings> = {}) =>
	server.client.agents.setSettings({
		runner: "superset",
		enabled: true,
		projects: [projectRow(rootId(server, key), overrides)],
	});

const titles = { manager: "CDE manager", builder: "CDE-42", reviewer: "CDE-42 review" } as const;

// Stores one session as the server holds it after a runner start. A builder
// or a reviewer works CDE-42 unless `overrides` names another ticket.
export const addSession = (server: FakeServer, overrides: Partial<AgentSession> & Pick<AgentSession, "role">) => {
	const ticketId = overrides.role === "manager" ? null : findTicket(server.state, "CDE-42")!.id;
	const session: AgentSession = {
		id: newId(),
		projectId: rootId(server),
		ticketId,
		runner: "superset",
		state: "running",
		workspaceId: "ws-1",
		terminalId: "term-1",
		title: titles[overrides.role],
		openUrl: "superset://workspace/ws-1",
		lastWokenAt: null,
		createdAt: isoNow(),
		...overrides,
	};
	server.state.agentSessions.set(session.id, session);
	return session;
};

// Changes one stored session and returns the event the server sends for it.
export const updateSession = (server: FakeServer, id: string, patch: Partial<AgentSession>) => {
	const session = { ...server.state.agentSessions.get(id)!, ...patch };
	server.state.agentSessions.set(id, session);
	return { type: "agents.session" as const, session };
};
