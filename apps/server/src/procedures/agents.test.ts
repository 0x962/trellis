import { describe, expect, test } from "bun:test";
import type { Activity, AgentInboxOutput } from "@trellis/api";
import { sql } from "drizzle-orm";
import { agentsHarness, MANAGER, MANAGER_TAB } from "../../test/helpers/agents.ts";
import { createTestApp, NAVID } from "../../test/helpers/app.ts";

// The agents procedures over app.request. The runner in these tests is the
// fake `superset` binary from TRELLIS_SUPERSET_BIN, which records its
// argument lists.

const a = agentsHarness();

const inbox = async (limit?: number): Promise<AgentInboxOutput> => {
	const response = await a.t.api("/api/agents/inbox", {
		method: "POST",
		body: limit === undefined ? { project: "CDE" } : { project: "CDE", limit },
		actor: MANAGER,
	});
	expect(response.status).toBe(200);
	return response.body as AgentInboxOutput;
};

const comment = (ticket: string, body: string, actor = NAVID) =>
	a.t.api(`/api/tickets/${ticket}/comments`, { method: "POST", body: { body }, actor });

const actorsOf = (events: Activity[]) => [...new Set(events.map((event) => `${event.actor.kind}:${event.actor.name}`))];

describe("agents procedures", () => {
	test("server builder: agents.register stores the session and returns it; a second call for the same terminal updates the row", async () => {
		const project = await a.t.seedProject();
		const first = await a.registerManager("claude-1");
		expect(first).toMatchObject({
			projectId: project.id,
			ticketId: null,
			role: "manager",
			runner: "superset",
			state: "running",
			...MANAGER_TAB,
			title: "CDE manager",
			openUrl: null,
			lastWokenAt: null,
		});
		const second = await a.registerManager("claude-2");
		expect(second.id).toBe(first.id);
		const stored = await a.db.execute(sql`SELECT claude_session_id FROM agent_sessions`);
		expect(stored.rows).toEqual([{ claude_session_id: "claude-2" }]);
		expect(a.sessionEvents().map((session) => session.id)).toEqual([first.id, first.id]);
	});

	test("server builder: agents.sessions lists the sessions of a project, and of one ticket", async () => {
		await a.t.seedProject();
		const ticket = await a.t.createTicket({ project: "CDE", title: "Fix login" });
		const manager = await a.registerManager();
		const body = { role: "builder", project: "CDE", ticket: "CDE-1", workspaceId: "ws-b", terminalId: "t-b", claudeSessionId: "c" };
		const builder = await a.t.api("/api/agents/register", { method: "POST", body, actor: "agent:builder-cde-1" });
		expect(builder.body).toMatchObject({ role: "builder", ticketId: ticket.id, title: "CDE-1" });

		const ofProject = await a.t.api("/api/agents/sessions?project=CDE", { actor: null });
		expect(ofProject.body.sessions.map((session: { id: string }) => session.id)).toEqual([manager.id, builder.body.id]);
		const ofTicket = await a.t.api("/api/agents/sessions?ticket=CDE-1", { actor: null });
		expect(ofTicket.body.sessions.map((session: { id: string }) => session.id)).toEqual([builder.body.id]);
	});

	test("server builder: agents.inbox returns the activity after the stored cursor with ticket summaries and comment bodies, then advances the cursor", async () => {
		await a.t.seedProject();
		const before = await inbox();
		const ticket = await a.t.createTicket({ project: "CDE", title: "Fix login" });
		await comment("CDE-1", "Body A");
		const read = await inbox();
		expect(read.events.length).toBeGreaterThanOrEqual(2);
		expect(read.events.every((event) => event.id > before.cursor)).toBe(true);
		expect(actorsOf(read.events)).toEqual(["human:navid"]);
		expect(read.events.map((event) => event.action)).toContain("comment.created");
		expect(read.tickets.map((summary) => summary.identifier)).toEqual(["CDE-1"]);
		expect(read.tickets[0]!.id).toBe(ticket.id);
		expect(read.comments.map((found) => found.body)).toEqual(["Body A"]);
		expect(read.cursor).toBe(read.events.at(-1)!.id);
		expect(read.more).toBe(false);
		const stored = await a.db.execute(sql`SELECT activity_id FROM agent_cursors`);
		expect(stored.rows).toEqual([{ activity_id: read.cursor }]);
	});

	test("server builder: agents.inbox leaves out the rows the manager wrote, and a second call right after returns no events", async () => {
		await a.t.seedProject();
		await a.t.createTicket({ project: "CDE", title: "Fix login" });
		await inbox();
		await comment("CDE-1", "Manager note", MANAGER);
		await comment("CDE-1", "Navid note");
		const read = await inbox();
		expect(actorsOf(read.events)).toEqual(["human:navid"]);
		expect(read.comments.map((found) => found.body)).toEqual(["Navid note"]);
		const again = await inbox();
		expect(again.events).toEqual([]);
		expect(again.tickets).toEqual([]);
		expect(again.more).toBe(false);
		expect(again.cursor).toBe(read.cursor);
	});

	test("server builder: agents.inbox with more rows than the limit returns the limit, more: true, and the cursor of the last row", async () => {
		await a.t.seedProject();
		await inbox();
		for (const title of ["One", "Two", "Three"]) await a.t.createTicket({ project: "CDE", title });
		const page = await inbox(2);
		expect(page.events).toHaveLength(2);
		expect(page.more).toBe(true);
		expect(page.cursor).toBe(page.events[1]!.id);
		const rest = await inbox();
		expect(rest.events.length).toBeGreaterThanOrEqual(1);
		expect(rest.events[0]!.id).toBeGreaterThan(page.cursor);
		expect(rest.more).toBe(false);
	});

	test("server builder: agents.startBuilder creates the ticket workspace through the runner and returns a starting builder session", async () => {
		const project = await a.enable();
		const ticket = await a.t.createTicket({ project: "CDE", title: "Fix login" });
		const started = await a.startBuilder("CDE-1");
		expect(started).toMatchObject({
			projectId: project.id,
			ticketId: ticket.id,
			role: "builder",
			state: "starting",
			title: "CDE-1",
			openUrl: `superset://workspace/${started.workspaceId}`,
		});
		expect(a.stub.callsOf("ws create")).toHaveLength(1);
		expect(a.stub.state().workspaces.at(-1)).toMatchObject({
			id: started.workspaceId,
			name: "CDE-1",
			branch: "cde-1-fix-login",
			tag: "trellis-cde",
			projectId: "sp-web",
		});
		expect(a.stub.terminal(started.terminalId!).title).toBe("CDE-1");
		expect(a.sessionEvents().map((session) => session.id)).toEqual([started.id]);
	});

	test("server builder: agents.startBuilder a second time for the same ticket returns the same session and creates no workspace", async () => {
		await a.enable();
		await a.t.createTicket({ project: "CDE", title: "Fix login" });
		const first = await a.startBuilder("CDE-1");
		const second = await a.startBuilder("CDE-1");
		expect(second).toEqual(first);
		expect(a.stub.callsOf("ws create")).toHaveLength(1);
	});

	test("server builder: agents.startBuilder at maxConcurrent answers CONCURRENCY_LIMIT with the limit and the running count", async () => {
		await a.enable({ maxConcurrent: 1 });
		await a.t.createTicket({ project: "CDE", title: "One" });
		await a.t.createTicket({ project: "CDE", title: "Two" });
		await a.startBuilder("CDE-1");
		const refused = await a.t.api("/api/agents/builder", { method: "POST", body: { ticket: "CDE-2" }, actor: MANAGER });
		expect(refused.status).toBe(409);
		expect(refused.body).toMatchObject({ code: "CONCURRENCY_LIMIT", data: { limit: 1, running: 1 } });
		expect(a.stub.callsOf("ws create")).toHaveLength(1);
	});

	test("server builder: agents.startBuilder answers RUNNER_UNAVAILABLE disabled when the global or the project switch is off", async () => {
		const project = await a.enable({}, false);
		await a.t.createTicket({ project: "CDE", title: "Fix login" });
		const offGlobally = await a.t.api("/api/agents/builder", { method: "POST", body: { ticket: "CDE-1" }, actor: MANAGER });
		expect(offGlobally.status).toBe(503);
		expect(offGlobally.body).toMatchObject({ code: "RUNNER_UNAVAILABLE", data: { reason: "disabled" } });
		const row = { projectId: project.id, enabled: false, supersetProjectId: null, baseBranch: "main" };
		await a.t.api("/api/agents/settings", { method: "PUT", body: { runner: "superset", enabled: true, projects: [row] } });
		const offForProject = await a.t.api("/api/agents/builder", { method: "POST", body: { ticket: "CDE-1" }, actor: MANAGER });
		expect(offForProject.body).toMatchObject({ code: "RUNNER_UNAVAILABLE", data: { reason: "disabled" } });
		expect(a.stub.calls()).toEqual([]);
	});

	test("server builder: agents.startBuilder answers RUNNER_UNAVAILABLE missing when the superset binary does not exist", async () => {
		await a.enable();
		await a.t.createTicket({ project: "CDE", title: "Fix login" });
		const absent = await createTestApp({ db: a.testDb, supersetBin: "/no/such/superset" });
		const refused = await absent.api("/api/agents/builder", { method: "POST", body: { ticket: "CDE-1" }, actor: MANAGER });
		await absent.close();
		expect(refused.status).toBe(503);
		expect(refused.body).toMatchObject({ code: "RUNNER_UNAVAILABLE", data: { reason: "missing" } });
		const sessions = await a.db.execute(sql`SELECT count(*)::int AS n FROM agent_sessions`);
		expect(sessions.rows[0]!.n).toBe(0);
	});

	test("server builder: agents.startReviewer opens a reviewer terminal in the builder's workspace and answers INVALID_PR_URL for another URL", async () => {
		await a.enable();
		const ticket = await a.t.createTicket({ project: "CDE", title: "Fix login" });
		const builder = await a.startBuilder("CDE-1");
		const prUrl = "https://github.com/acme/web/pull/7";
		const reviewer = await a.t.api("/api/agents/reviewer", { method: "POST", body: { ticket: "CDE-1", prUrl }, actor: MANAGER });
		expect(reviewer.status).toBe(200);
		expect(reviewer.body).toMatchObject({
			ticketId: ticket.id,
			role: "reviewer",
			title: "CDE-1 review",
			workspaceId: builder.workspaceId,
		});
		expect(a.stub.terminal(reviewer.body.terminalId).title).toBe("CDE-1 review");
		const refused = await a.t.api("/api/agents/reviewer", {
			method: "POST",
			body: { ticket: "CDE-1", prUrl: "https://example.com/acme/web/pull/7" },
			actor: MANAGER,
		});
		expect(refused.status).toBe(400);
		expect(refused.body.code).toBe("INVALID_PR_URL");
	});

	test("server builder: agents.stop sets the state to stopped and emits agents.session", async () => {
		await a.enable();
		await a.t.createTicket({ project: "CDE", title: "Fix login" });
		const builder = await a.startBuilder("CDE-1");
		const stopped = await a.t.api(`/api/agents/sessions/${builder.id}/stop`, { method: "POST", body: {}, actor: MANAGER });
		expect(stopped.status).toBe(200);
		expect(stopped.body).toMatchObject({ id: builder.id, state: "stopped" });
		expect(a.stub.callsOf("terminals close")).toHaveLength(1);
		expect(a.sessionEvents().at(-1)).toMatchObject({ id: builder.id, state: "stopped" });
	});

	test("server builder: agents.wake sends the text to the manager's terminal, sets lastWokenAt, and emits agents.session", async () => {
		await a.enable();
		const manager = await a.registerManager();
		const before = Date.now();
		const woken = await a.t.api("/api/agents/wake", {
			method: "POST",
			body: { project: "CDE", text: "trellis: 1 change in CDE" },
		});
		const after = Date.now();
		expect(woken.status).toBe(200);
		expect(woken.body).toMatchObject({ id: manager.id, terminalId: "t-m", state: "running" });
		const wokenAt = Date.parse(woken.body.lastWokenAt);
		expect(wokenAt).toBeGreaterThanOrEqual(before);
		expect(wokenAt).toBeLessThanOrEqual(after);
		expect(a.stub.terminal("t-m").sent).toEqual(["trellis: 1 change in CDE"]);
		expect(a.sessionEvents().at(-1)).toMatchObject({ id: manager.id, lastWokenAt: woken.body.lastWokenAt });
	});

	test("server builder: agents.settings returns runner superset, enabled false, and no projects before the first setSettings", async () => {
		const read = await a.t.api("/api/agents/settings", { actor: null });
		expect(read.status).toBe(200);
		expect(read.body).toEqual({ runner: "superset", enabled: false, projects: [] });
	});

	test("server builder: agents.setSettings replaces the settings and agents.settings returns them", async () => {
		const project = await a.enable({ maxConcurrent: 5, supersetProjectId: "sp-web", baseBranch: "develop" });
		const expected = {
			runner: "superset",
			enabled: true,
			projects: [
				{
					projectId: project.id,
					enabled: true,
					supersetProjectId: "sp-web",
					baseBranch: "develop",
					maxConcurrent: 5,
					removeWorkspaceOnDone: true,
				},
			],
		};
		expect((await a.t.api("/api/agents/settings", { actor: null })).body).toEqual(expected);
		const replaced = await a.t.api("/api/agents/settings", {
			method: "PUT",
			body: { runner: "superset", enabled: false, projects: [] },
		});
		expect(replaced.body).toEqual({ runner: "superset", enabled: false, projects: [] });
		expect((await a.t.api("/api/agents/settings", { actor: null })).body).toEqual(replaced.body);
		const general = await a.t.api("/api/settings", { actor: null });
		expect(Object.keys(general.body).sort()).toEqual(["defaultActorName", "stalledHours", "startWithAgentTemplate"]);
	});
});
