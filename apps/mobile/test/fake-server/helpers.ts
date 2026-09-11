import type { AgentProjectSettings, AgentSession, GhStatus } from "@trellis/api";
import type { FakeServer } from "./index";
import { findTicket } from "./refs";
import { isoNow, newId, type State } from "./state";

// The helpers the contract tests of this server share: a file of an exact
// size, a signed-in gh, and one stored agent session.

// A file of exactly `size` bytes. The content is one repeated character, so
// two files of one size hold the same bytes and the same hash. The bytes go
// in as a typed array, because a File built from a string carries the
// charset of that string in its type.
export const fileOf = (name: string, mime: string, size: number, fill = "a") =>
	new File([new TextEncoder().encode(fill.repeat(size))], name, { type: mime });

// gh answers every request, so link and refresh reach the pull request.
export const ghReady = (server: FakeServer) => {
	const status: GhStatus = { ok: true, user: "octocat", reason: null, message: null, checkedAt: isoNow() };
	server.state.gh = status;
	return status;
};

// The id of the root project with `key`.
export const rootId = (server: FakeServer, key = "CDE") =>
	[...(server.state as State).projects.values()].find((project) => project.parentId === null && project.key === key)!
		.id;

// One settings row with the manager on and the contract defaults.
export const projectRow = (projectId: string, overrides: Partial<AgentProjectSettings> = {}): AgentProjectSettings => ({
	projectId,
	enabled: true,
	supersetProjectId: null,
	baseBranch: null,
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
		error: null,
		createdAt: isoNow(),
		...overrides,
	};
	server.state.agentSessions.set(session.id, session);
	return session;
};
