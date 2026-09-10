import { describe, expect, test } from "bun:test";
import type { Activity, AgentInboxOutput } from "@trellis/api";
import { agentsHarness } from "../../test/helpers/agents.ts";
import { createTestApp, NAVID } from "../../test/helpers/app.ts";
import { flagOf } from "../../test/helpers/superset-stub.ts";

// The agents procedures over app.request. The runner in these tests is the
// fake `superset` binary from TRELLIS_SUPERSET_BIN, which records its
// argument lists. Every test works in a project of its own key.

const a = agentsHarness();

const inbox = async (limit?: number): Promise<AgentInboxOutput> => {
	const response = await a.post(
		"/api/agents/inbox",
		limit === undefined ? { project: a.key } : { project: a.key, limit },
	);
	expect(response.status).toBe(200);
	return response.body as AgentInboxOutput;
};

const comment = (ticket: string, body: string, actor = NAVID) =>
	a.t.api(`/api/tickets/${ticket}/comments`, { method: "POST", body: { body }, actor });

const actorsOf = (events: Activity[]) => [...new Set(events.map((event) => `${event.actor.kind}:${event.actor.name}`))];

const ids = (sessions: Array<{ id: string }>) => sessions.map((session) => session.id);

describe("agents procedures", () => {
	test("server builder: agents.register stores the session and returns it; a second call for the same terminal updates the row", async () => {
		const project = await a.enable();
		const first = await a.registerManager("claude-1");
		expect(first).toMatchObject({
			projectId: project.id,
			ticketId: null,
			role: "manager",
			runner: "superset",
			state: "running",
			...a.tab,
			title: `${a.key} manager`,
			openUrl: null,
			lastWokenAt: null,
		});
		const second = await a.registerManager("claude-2");
		expect(second.id).toBe(first.id);
		expect(ids(await a.sessions(`project=${a.key}`))).toEqual([first.id]);
		expect(ids(a.sessionEvents())).toEqual([first.id, first.id]);
		// The row holds the second Claude session: a wake of the exited manager
		// resumes it.
		a.stub.exit(a.tab.terminalId);
		expect((await a.post("/api/agents/wake", { project: a.key, text: "hello" })).status).toBe(200);
		expect(flagOf(a.stub.callsOf("terminals create")[0]!, "--command")).toContain("--resume 'claude-2'");
	});

	test("server builder: agents.sessions lists the sessions of a project, and of one ticket", async () => {
		await a.t.seedProject(a.key);
		const ticket = await a.t.createTicket({ project: a.key, title: "Fix login" });
		const manager = await a.registerManager();
		const body = {
			role: "builder",
			project: a.key,
			ticket: a.ticket(1),
			workspaceId: `ws-b-${a.key}`,
			terminalId: `t-b-${a.key}`,
			claudeSessionId: "c",
		};
		const builder = await a.t.api("/api/agents/register", {
			method: "POST",
			body,
			actor: `agent:builder-${a.lower}-1`,
		});
		expect(builder.body).toMatchObject({ role: "builder", ticketId: ticket.id, title: a.ticket(1) });
		expect(ids(await a.sessions(`project=${a.key}`))).toEqual([manager.id, builder.body.id]);
		expect(ids(await a.sessions(`ticket=${a.ticket(1)}`))).toEqual([builder.body.id]);
	});

	test("server builder: agents.inbox returns the activity after the stored cursor with ticket summaries and comment bodies, then advances the cursor", async () => {
		await a.t.seedProject(a.key);
		const before = await inbox();
		const ticket = await a.t.createTicket({ project: a.key, title: "Fix login" });
		await comment(a.ticket(1), "Body A");
		const read = await inbox();
		expect(read.events.length).toBeGreaterThanOrEqual(2);
		expect(read.events.every((event) => event.id > before.cursor)).toBe(true);
		expect(actorsOf(read.events)).toEqual(["human:navid"]);
		expect(read.events.map((event) => event.action)).toContain("comment.created");
		expect(read.tickets.map((summary) => summary.id)).toEqual([ticket.id]);
		expect(read.comments.map((found) => found.body)).toEqual(["Body A"]);
		expect(read.cursor).toBe(read.events.at(-1)!.id);
		expect(read.more).toBe(false);
		await comment(a.ticket(1), "Body B");
		const next = await inbox();
		expect(next.comments.map((found) => found.body)).toEqual(["Body B"]);
		expect(next.events[0]!.id).toBeGreaterThan(read.cursor);
	});

	test("server builder: agents.inbox leaves out the rows the manager wrote, and a second call right after returns no events", async () => {
		await a.t.seedProject(a.key);
		await a.t.createTicket({ project: a.key, title: "Fix login" });
		await inbox();
		await comment(a.ticket(1), "Manager note", a.manager);
		await comment(a.ticket(1), "Navid note");
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
		await a.t.seedProject(a.key);
		await inbox();
		for (const title of ["One", "Two", "Three"]) await a.t.createTicket({ project: a.key, title });
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
		const ticket = await a.t.createTicket({ project: a.key, title: "Fix login" });
		const started = await a.startBuilder(a.ticket(1));
		expect(started).toMatchObject({
			projectId: project.id,
			ticketId: ticket.id,
			role: "builder",
			state: "starting",
			title: a.ticket(1),
			openUrl: `superset://workspace/${started.workspaceId}`,
		});
		expect(a.stub.callsOf("ws create")).toHaveLength(1);
		expect(a.stub.state().workspaces.at(-1)).toMatchObject({
			id: started.workspaceId,
			name: a.ticket(1),
			branch: `${a.lower}-1-fix-login`,
			tag: `trellis-${a.lower}`,
			projectId: "sp-web",
		});
		expect(a.stub.terminal(started.terminalId!).title).toBe(a.ticket(1));
		expect(ids(a.sessionEvents())).toEqual([started.id]);
	});

	test("server builder: agents.startBuilder a second time for the same ticket returns the same session and creates no workspace", async () => {
		await a.enable();
		await a.t.createTicket({ project: a.key, title: "Fix login" });
		const first = await a.startBuilder(a.ticket(1));
		const second = await a.startBuilder(a.ticket(1));
		expect(second).toEqual(first);
		expect(a.stub.callsOf("ws create")).toHaveLength(1);
	});

	test("server builder: agents.startBuilder at maxConcurrent answers CONCURRENCY_LIMIT with the limit and the running count", async () => {
		await a.enable({ maxConcurrent: 1 });
		await a.t.createTicket({ project: a.key, title: "One" });
		await a.t.createTicket({ project: a.key, title: "Two" });
		await a.startBuilder(a.ticket(1));
		const refused = await a.post("/api/agents/builder", { ticket: a.ticket(2) });
		expect(refused.status).toBe(409);
		expect(refused.body).toMatchObject({ code: "CONCURRENCY_LIMIT", data: { limit: 1, running: 1 } });
		expect(a.stub.callsOf("ws create")).toHaveLength(1);
	});

	test("server builder: agents.startBuilder answers RUNNER_UNAVAILABLE disabled when the global or the project switch is off", async () => {
		const project = await a.enable({}, false);
		await a.t.createTicket({ project: a.key, title: "Fix login" });
		const offGlobally = await a.post("/api/agents/builder", { ticket: a.ticket(1) });
		expect(offGlobally.status).toBe(503);
		expect(offGlobally.body).toMatchObject({ code: "RUNNER_UNAVAILABLE", data: { reason: "disabled" } });
		await a.setAgents(project.id, { enabled: false });
		const offForProject = await a.post("/api/agents/builder", { ticket: a.ticket(1) });
		expect(offForProject.body).toMatchObject({ code: "RUNNER_UNAVAILABLE", data: { reason: "disabled" } });
		expect(a.stub.calls()).toEqual([]);
	});

	test("server builder: agents.startBuilder answers RUNNER_UNAVAILABLE missing when the superset binary does not exist", async () => {
		await a.enable();
		await a.t.createTicket({ project: a.key, title: "Fix login" });
		a.removeBin();
		const refused = await a.post("/api/agents/builder", { ticket: a.ticket(1) });
		expect(refused.status).toBe(503);
		expect(refused.body).toMatchObject({ code: "RUNNER_UNAVAILABLE", data: { reason: "missing" } });
		expect(await a.sessions(`project=${a.key}`)).toEqual([]);
	});

	test("server builder: agents.startReviewer opens a reviewer terminal in the builder's workspace and answers INVALID_PR_URL for another URL", async () => {
		await a.enable();
		const ticket = await a.t.createTicket({ project: a.key, title: "Fix login" });
		const builder = await a.startBuilder(a.ticket(1));
		const prUrl = "https://github.com/acme/web/pull/7";
		const reviewer = await a.post("/api/agents/reviewer", { ticket: a.ticket(1), prUrl });
		expect(reviewer.status).toBe(200);
		expect(reviewer.body).toMatchObject({
			ticketId: ticket.id,
			role: "reviewer",
			title: `${a.ticket(1)} review`,
			workspaceId: builder.workspaceId,
		});
		expect(a.stub.terminal(reviewer.body.terminalId).title).toBe(`${a.ticket(1)} review`);
		const refused = await a.post("/api/agents/reviewer", {
			ticket: a.ticket(1),
			prUrl: "https://example.com/acme/web/pull/7",
		});
		expect(refused.status).toBe(400);
		expect(refused.body.code).toBe("INVALID_PR_URL");
	});

	test("server builder: agents.stop sets the state to stopped and emits agents.session", async () => {
		await a.enable();
		await a.t.createTicket({ project: a.key, title: "Fix login" });
		const builder = await a.startBuilder(a.ticket(1));
		const stopped = await a.post(`/api/agents/sessions/${builder.id}/stop`, {});
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
			body: { project: a.key, text: `trellis: 1 change in ${a.key}` },
		});
		const after = Date.now();
		expect(woken.status).toBe(200);
		expect(woken.body).toMatchObject({ id: manager.id, terminalId: a.tab.terminalId, state: "running" });
		const wokenAt = Date.parse(woken.body.lastWokenAt);
		expect(wokenAt).toBeGreaterThanOrEqual(before);
		expect(wokenAt).toBeLessThanOrEqual(after);
		expect(a.stub.terminal(a.tab.terminalId).sent).toEqual([`trellis: 1 change in ${a.key}`]);
		expect(a.sessionEvents().at(-1)).toMatchObject({ id: manager.id, lastWokenAt: woken.body.lastWokenAt });
	});

	test("server builder: agents.settings returns runner superset, enabled false, and no projects before the first setSettings", async () => {
		const fresh = await createTestApp();
		const read = await fresh.api("/api/agents/settings", { actor: null });
		await fresh.close();
		expect(read.status).toBe(200);
		expect(read.body).toEqual({ runner: "superset", enabled: false, projects: [] });
	});

	test("server builder: agents.setSettings replaces the settings and agents.settings returns them", async () => {
		const project = await a.enable({ maxConcurrent: 5, supersetProjectId: "sp-web", baseBranch: "develop" });
		const row = {
			projectId: project.id,
			enabled: true,
			supersetProjectId: "sp-web",
			baseBranch: "develop",
			maxConcurrent: 5,
			removeWorkspaceOnDone: true,
		};
		const expected = { runner: "superset", enabled: true, projects: [row] };
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
