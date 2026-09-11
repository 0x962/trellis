import type { AgentProjectSettings, AgentSession } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { sharedDb } from "./server/db.ts";
import type { TestServer } from "./server/index.ts";

// Helpers for the agent tests. A session row is a fixture: the runner writes
// one when it starts an agent, and a web test reads it back through
// `agents.sessions` without spawning anything.

// The id of the root project with `key`.
export const rootId = async (server: TestServer, key = "CDE") =>
	(await server.client.projects.get({ project: key })).id;

// One settings row with the manager on and the contract defaults.
export const projectRow = (projectId: string, overrides: Partial<AgentProjectSettings> = {}): AgentProjectSettings => ({
	projectId,
	enabled: true,
	supersetProjectId: null,
	supersetHostId: null,
	baseBranch: null,
	maxConcurrent: 3,
	removeWorkspaceOnDone: true,
	...overrides,
});

// Turns agents on and the manager of `key` on, with `overrides` on its row.
export const enableAgents = async (server: TestServer, key = "CDE", overrides: Partial<AgentProjectSettings> = {}) =>
	await server.client.agents.setSettings({
		runner: "superset",
		enabled: true,
		projects: [projectRow(await rootId(server, key), overrides)],
	});

const titles = { manager: "CDE manager", builder: "CDE-42", reviewer: "CDE-42 review" } as const;
const names = { manager: "Amara", builder: "Kenji", reviewer: "Nadia" } as const;

export const isoNow = () => new Date().toISOString();

// Stores one session as the server holds it after a runner start. A builder
// or a reviewer works CDE-42 unless `overrides` names another ticket.
export const addSession = async (
	server: TestServer,
	overrides: Partial<AgentSession> & Pick<AgentSession, "role">,
): Promise<AgentSession> => {
	await server.ready;
	const ticketId = overrides.role === "manager" ? null : (await server.client.tickets.get({ ticket: "CDE-42" })).id;
	const session: AgentSession = {
		id: ulid(),
		projectId: await rootId(server),
		ticketId,
		runner: "superset",
		state: "running",
		workspaceId: "ws-1",
		terminalId: "term-1",
		name: names[overrides.role],
		title: titles[overrides.role],
		openUrl: "superset://workspace/ws-1",
		lastWokenAt: null,
		error: null,
		createdAt: isoNow(),
		...overrides,
	};
	const { db } = await sharedDb();
	await db.execute(sql`
		INSERT INTO agent_sessions (id, project_id, ticket_id, role, runner, state, workspace_id, terminal_id,
			claude_session_id, name, title, open_url, last_woken_at, error, created_at, updated_at)
		VALUES (${session.id}, ${session.projectId}, ${session.ticketId}, ${session.role}, ${session.runner},
			${session.state}, ${session.workspaceId}, ${session.terminalId}, NULL, ${session.name}, ${session.title},
			${session.openUrl}, ${session.lastWokenAt}, ${session.error}, ${session.createdAt}::timestamptz,
			${session.createdAt}::timestamptz)
	`);
	return session;
};

// The message the server stores when `superset ws create` refuses a base
// branch that the repository does not have.
export const startError =
	"The agent runner cannot serve the request. superset ws create: fatal: invalid reference: main";

// The short reason the web shows for `startError`.
export const startReason = "superset ws create: fatal: invalid reference: main";

// A manager or a builder whose start failed before the runner made a
// workspace.
export const failedSession = (server: TestServer, role: "manager" | "builder") =>
	addSession(server, {
		role,
		state: "failed",
		workspaceId: null,
		terminalId: null,
		openUrl: null,
		error: startError,
	});

// Changes one stored session and returns the event the server sends for it.
export const updateSession = async (server: TestServer, id: string, patch: Partial<AgentSession>) => {
	const { sessions } = await server.client.agents.sessions({ project: await rootId(server) });
	const session = { ...(sessions.find((entry) => entry.id === id) as AgentSession), ...patch };
	const { db } = await sharedDb();
	await db.execute(sql`
		UPDATE agent_sessions SET state = ${session.state}, workspace_id = ${session.workspaceId},
			terminal_id = ${session.terminalId}, open_url = ${session.openUrl}, error = ${session.error},
			last_woken_at = ${session.lastWokenAt}, title = ${session.title}
		WHERE id = ${id}
	`);
	return { type: "agents.session" as const, session };
};
