import { describe, expect, test } from "bun:test";
import { agentSession, projectId, t1, ticketSummary, ulid } from "../../test/fixtures.ts";
import {
	AgentInboxInputSchema,
	AgentInboxOutputSchema,
	AgentRegisterInputSchema,
	AgentSessionSchema,
	AgentSessionsInputSchema,
	AgentSettingsSchema,
	AgentSettingsSetInputSchema,
	AgentWakeInputSchema,
} from "./agent.ts";

const ok = (schema: { safeParse: (value: unknown) => { success: boolean } }, value: unknown) =>
	schema.safeParse(value).success;

// The server, the CLI, and the web read one session row. A field that one of
// them adds alone is a field the other two cannot trust, so the key set is
// pinned.
describe("agent sessions", () => {
	test("a session row has exactly the fields the dispatch plan lists", () => {
		expect(Object.keys(AgentSessionSchema.shape).sort()).toEqual([
			"blocked",
			"createdAt",
			"id",
			"lastWokenAt",
			"openUrl",
			"projectId",
			"role",
			"runner",
			"state",
			"terminalId",
			"ticketId",
			"title",
			"workspaceId",
		]);
	});

	test("a session takes the three roles, the five states, and the superset runner only", () => {
		expect(ok(AgentSessionSchema, agentSession())).toBe(true);
		for (const role of ["manager", "builder", "reviewer"]) {
			expect(ok(AgentSessionSchema, agentSession({ role })), role).toBe(true);
		}
		for (const state of ["starting", "running", "waiting", "exited", "stopped"]) {
			expect(ok(AgentSessionSchema, agentSession({ state })), state).toBe(true);
		}
		expect(ok(AgentSessionSchema, agentSession({ role: "lead" }))).toBe(false);
		expect(ok(AgentSessionSchema, agentSession({ state: "done" }))).toBe(false);
		expect(ok(AgentSessionSchema, agentSession({ runner: "codex" }))).toBe(false);
		expect(ok(AgentSessionSchema, agentSession({ title: "" }))).toBe(false);
	});

	// A manager has no ticket, and a session that is still starting has no
	// Superset workspace, terminal, or link yet.
	test("the ticket, the Superset handles, the link, and the last wake time may be null", () => {
		const manager = agentSession({
			role: "manager",
			ticketId: null,
			workspaceId: null,
			terminalId: null,
			openUrl: null,
			lastWokenAt: null,
			title: "CDE manager",
		});
		expect(ok(AgentSessionSchema, manager)).toBe(true);
		expect(ok(AgentSessionSchema, agentSession({ blocked: undefined }))).toBe(false);
		expect(ok(AgentSessionSchema, agentSession({ lastWokenAt: "2026-09-10T10:01:00.000Z" }))).toBe(true);
		expect(ok(AgentSessionSchema, agentSession({ lastWokenAt: "yesterday" }))).toBe(false);
	});

	// A blocked session names the reason and, for the folder trust dialog,
	// the folder a human trusts to clear it.
	test("a blocked session carries a reason, an optional path, and a time", () => {
		const at = "2026-09-10T10:02:00.000Z";
		const trust = { reason: "folder-trust", path: "/Users/navid/projects/trellis", detail: null, at };
		expect(ok(AgentSessionSchema, agentSession({ blocked: trust }))).toBe(true);
		expect(ok(AgentSessionSchema, agentSession({ blocked: { ...trust, reason: "no-register", path: null } }))).toBe(
			true,
		);
		expect(ok(AgentSessionSchema, agentSession({ blocked: { ...trust, reason: "bored" } }))).toBe(false);
		expect(ok(AgentSessionSchema, agentSession({ blocked: { ...trust, at: "yesterday" } }))).toBe(false);
	});

	// `ticket` narrows to one ticket, `project` to one project. Both at once
	// has two meanings, and neither lists every session of every project.
	test("agents.sessions takes exactly one of project and ticket", () => {
		expect(ok(AgentSessionsInputSchema, { project: "CDE" })).toBe(true);
		expect(ok(AgentSessionsInputSchema, { ticket: "CDE-42" })).toBe(true);
		expect(ok(AgentSessionsInputSchema, {})).toBe(false);
		expect(ok(AgentSessionsInputSchema, { project: "CDE", ticket: "CDE-42" })).toBe(false);
	});
});

describe("agents.register", () => {
	const register = {
		role: "builder",
		project: "CDE",
		ticket: "cde-42",
		workspaceId: "ws-7f3a",
		terminalId: "term-1",
		claudeSessionId: "9b1f0c3e-2d4a-4f7b-8c6d-1a2b3c4d5e6f",
	};

	// The manager serves the whole project. A builder or a reviewer works
	// one ticket, so it names that ticket.
	test("a manager names no ticket and a builder or a reviewer names one", () => {
		expect(AgentRegisterInputSchema.parse(register).ticket).toBe("CDE-42");
		expect(ok(AgentRegisterInputSchema, { ...register, role: "reviewer" })).toBe(true);
		const { ticket: _, ...withoutTicket } = register;
		expect(ok(AgentRegisterInputSchema, { ...withoutTicket, role: "manager" })).toBe(true);
		expect(ok(AgentRegisterInputSchema, { ...register, role: "manager" })).toBe(false);
		expect(ok(AgentRegisterInputSchema, withoutTicket)).toBe(false);
	});

	// The runner resumes an exited agent from its Claude session id, so the
	// register call must carry it.
	test("register requires the Superset ids and the Claude session id and rejects an unknown key", () => {
		for (const key of ["workspaceId", "terminalId", "claudeSessionId", "project", "role"]) {
			const { [key]: _, ...rest } = register as Record<string, string>;
			expect(ok(AgentRegisterInputSchema, rest), key).toBe(false);
		}
		expect(ok(AgentRegisterInputSchema, { ...register, claudeSessionId: "" })).toBe(false);
		expect(ok(AgentRegisterInputSchema, { ...register, state: "running" })).toBe(false);
	});
});

describe("agents.inbox", () => {
	const activity = {
		id: 12,
		batchId: ulid,
		rootId: projectId,
		projectId,
		ticketId: t1,
		actor: { name: "navid", kind: "human" },
		action: "ticket.updated",
		field: "priority",
		fromValue: "low",
		toValue: "high",
		meta: {},
		createdAt: "2026-09-10T10:00:00.000Z",
	};
	const comment = {
		id: ulid,
		ticketId: t1,
		body: "Use the new client.",
		actor: { name: "navid", kind: "human" },
		createdAt: "2026-09-10T10:00:00.000Z",
		updatedAt: "2026-09-10T10:00:00.000Z",
	};

	test("the input names one project and pages by a limit of 1 to 500, 200 by default", () => {
		expect(AgentInboxInputSchema.parse({ project: "cde" })).toEqual({ project: "CDE", limit: 200 });
		expect(ok(AgentInboxInputSchema, { project: "CDE", limit: 500 })).toBe(true);
		for (const limit of [0, 501, 1.5]) {
			expect(ok(AgentInboxInputSchema, { project: "CDE", limit }), String(limit)).toBe(false);
		}
		expect(ok(AgentInboxInputSchema, {})).toBe(false);
	});

	// `cursor` is the id of the last activity row the manager has read. `more`
	// is true when rows after the cursor stay unread past the limit.
	test("the output carries the activity rows, their ticket summaries, the new comments, and the cursor", () => {
		const output = { events: [activity], tickets: [ticketSummary()], comments: [comment], cursor: 12, more: false };
		expect(ok(AgentInboxOutputSchema, output)).toBe(true);
		expect(ok(AgentInboxOutputSchema, { events: [], tickets: [], comments: [], cursor: 0, more: false })).toBe(true);
		expect(ok(AgentInboxOutputSchema, { ...output, cursor: -1 })).toBe(false);
		const { more: _, ...withoutMore } = output;
		expect(ok(AgentInboxOutputSchema, withoutMore)).toBe(false);
	});
});

test("agents.wake takes a project and a text of 1 to 2000 characters", () => {
	expect(ok(AgentWakeInputSchema, { project: "CDE", text: "trellis: 1 change in CDE" })).toBe(true);
	expect(ok(AgentWakeInputSchema, { project: "CDE", text: "x".repeat(2000) })).toBe(true);
	expect(ok(AgentWakeInputSchema, { project: "CDE", text: "" })).toBe(false);
	expect(ok(AgentWakeInputSchema, { project: "CDE", text: "x".repeat(2001) })).toBe(false);
});

describe("agent settings", () => {
	const project = {
		projectId,
		enabled: true,
		supersetProjectId: "sp-1",
		baseBranch: "main",
		maxConcurrent: 3,
		removeWorkspaceOnDone: true,
	};
	const settings = { runner: "superset", enabled: true, projects: [project] };

	test("the settings name the runner, the global switch, and one row per project", () => {
		expect(ok(AgentSettingsSchema, settings)).toBe(true);
		expect(ok(AgentSettingsSchema, { ...settings, projects: [] })).toBe(true);
		expect(ok(AgentSettingsSchema, { ...settings, runner: "codex" })).toBe(false);
		expect(ok(AgentSettingsSchema, { ...settings, projects: [{ ...project, supersetProjectId: null }] })).toBe(true);
		expect(ok(AgentSettingsSchema, { ...settings, projects: [{ ...project, baseBranch: "" }] })).toBe(false);
	});

	// Three parallel builders and a removed workspace on Done are the plan's
	// defaults, so a row that omits them gets them.
	test("maxConcurrent defaults to 3 and removeWorkspaceOnDone to true", () => {
		const { maxConcurrent: _, removeWorkspaceOnDone: __, ...bare } = project;
		const parsed = AgentSettingsSetInputSchema.parse({ ...settings, projects: [bare] });
		expect(parsed.projects[0]).toEqual(project);
		for (const maxConcurrent of [0, -1, 1.5, 21]) {
			const input = { ...settings, projects: [{ ...project, maxConcurrent }] };
			expect(ok(AgentSettingsSetInputSchema, input), String(maxConcurrent)).toBe(false);
		}
	});

	// A project has one manager, so it has one settings row.
	test("the set input rejects a project listed twice and an unknown key", () => {
		expect(ok(AgentSettingsSetInputSchema, { ...settings, projects: [project, project] })).toBe(false);
		expect(ok(AgentSettingsSetInputSchema, { ...settings, model: "opus" })).toBe(false);
		expect(ok(AgentSettingsSetInputSchema, { ...settings, projects: [{ ...project, model: "opus" }] })).toBe(false);
	});
});
