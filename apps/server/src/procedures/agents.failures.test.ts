import { describe, expect, test } from "bun:test";
import type { AgentSession } from "@trellis/api";
import { agentsHarness } from "../../test/helpers/agents.ts";

// A start the runner refuses keeps its session row in the `failed` state
// with the exit code and the whole stderr, so a person reads why without
// the server log. `agents.retry` runs the same start again. Every test
// works in a project of its own key.

const a = agentsHarness();

const start = (ticket: string) => a.post("/api/agents/builder", { ticket });

const PR_URL = "https://github.com/acme/web/pull/7";

const review = (ticket: string) => a.post("/api/agents/reviewer", { ticket, prUrl: PR_URL });

const retry = (id: string) => a.post(`/api/agents/sessions/${id}/retry`, {});

const failWs = () =>
	a.stub.update((state) => {
		state.failures["ws create"] = "fatal: invalid reference: main";
	});

const failTerminals = () =>
	a.stub.update((state) => {
		state.failures["terminals create"] = "Superset host is not running";
	});

const clearFailures = () =>
	a.stub.update((state) => {
		state.failures = {};
	});

// The one session of the test project, or of one ticket.
const only = async (query: string): Promise<AgentSession> => {
	const found = await a.sessions(query);
	expect(found).toHaveLength(1);
	return found[0]!;
};

describe("a failed builder start", () => {
	test("keeps a failed session row with the exit code and the whole stderr, and answers with both", async () => {
		await a.enable();
		await a.t.createTicket({ project: a.key, title: "Fix login" });
		failWs();
		const refused = await start(a.ticket(1));
		expect(refused.status).toBe(503);
		expect(refused.body).toMatchObject({
			code: "RUNNER_UNAVAILABLE",
			data: { reason: "error", exitCode: 1, detail: "fatal: invalid reference: main" },
		});
		const session = await only(`ticket=${a.ticket(1)}`);
		expect(session).toMatchObject({
			role: "builder",
			state: "failed",
			title: a.ticket(1),
			workspaceId: null,
			terminalId: null,
			failure: { reason: "error", exitCode: 1, detail: "fatal: invalid reference: main" },
		});
	});

	test("records reason missing with no exit code when the superset binary does not exist", async () => {
		await a.enable();
		await a.t.createTicket({ project: a.key, title: "Fix login" });
		a.removeBin();
		const refused = await start(a.ticket(1));
		expect(refused.body).toMatchObject({ code: "RUNNER_UNAVAILABLE", data: { reason: "missing", exitCode: null } });
		const session = await only(`ticket=${a.ticket(1)}`);
		expect(session.state).toBe("failed");
		expect(session.failure).toMatchObject({ reason: "missing", exitCode: null });
		expect(session.failure!.detail).toContain("superset");
	});

	test("records reason unmapped and names the repository when no Superset project holds it", async () => {
		await a.enable();
		await a.t.createTicket({ project: a.key, title: "Fix login" });
		a.stub.update((state) => {
			state.projects = [{ id: "sp-other", name: "other", repo: "acme/other", path: a.repoPath }];
		});
		const refused = await start(a.ticket(1));
		expect(refused.body).toMatchObject({ code: "RUNNER_UNAVAILABLE", data: { reason: "unmapped", exitCode: null } });
		const session = await only(`ticket=${a.ticket(1)}`);
		expect(session.failure).toMatchObject({ reason: "unmapped" });
		expect(session.failure!.detail).toContain("acme/web");
	});

	test("does not count toward the builder limit, and the next start of the ticket reuses its row", async () => {
		await a.enable({ maxConcurrent: 1 });
		await a.t.createTicket({ project: a.key, title: "One" });
		await a.t.createTicket({ project: a.key, title: "Two" });
		failWs();
		expect((await start(a.ticket(1))).status).toBe(503);
		const failed = await only(`ticket=${a.ticket(1)}`);
		clearFailures();
		// The failed builder of ticket 1 leaves the one slot free.
		expect((await start(a.ticket(2))).status).toBe(200);
		const started = await start(a.ticket(1));
		expect(started.status).toBe(409);
		expect(started.body.code).toBe("CONCURRENCY_LIMIT");
		await a.post(`/api/agents/sessions/${(await only(`ticket=${a.ticket(2)}`)).id}/stop`, {});
		const again = await start(a.ticket(1));
		expect(again.status).toBe(200);
		expect(again.body).toMatchObject({ id: failed.id, state: "starting", failure: null });
		expect(await a.sessions(`ticket=${a.ticket(1)}`)).toHaveLength(1);
	});
});

describe("a failed reviewer start", () => {
	test("keeps a failed session row with the exit code and the whole stderr", async () => {
		await a.enable();
		const ticket = await a.t.createTicket({ project: a.key, title: "Fix login" });
		const builder = await a.startBuilder(a.ticket(1));
		failTerminals();
		const refused = await review(a.ticket(1));
		expect(refused.status).toBe(503);
		expect(refused.body).toMatchObject({
			code: "RUNNER_UNAVAILABLE",
			data: { reason: "error", exitCode: 1, detail: "Superset host is not running" },
		});
		const reviewer = (await a.sessions(`ticket=${a.ticket(1)}`)).find((found) => found.role === "reviewer")!;
		expect(reviewer).toMatchObject({
			ticketId: ticket.id,
			state: "failed",
			title: `${a.ticket(1)} review`,
			workspaceId: builder.workspaceId,
			failure: { reason: "error", exitCode: 1, detail: "Superset host is not running" },
		});
	});

	test("records reason missing when the superset binary does not exist", async () => {
		await a.enable();
		await a.t.createTicket({ project: a.key, title: "Fix login" });
		await a.startBuilder(a.ticket(1));
		a.removeBin();
		expect((await review(a.ticket(1))).body).toMatchObject({
			code: "RUNNER_UNAVAILABLE",
			data: { reason: "missing", exitCode: null },
		});
		const reviewer = (await a.sessions(`ticket=${a.ticket(1)}`)).find((found) => found.role === "reviewer")!;
		expect(reviewer.state).toBe("failed");
		expect(reviewer.failure).toMatchObject({ reason: "missing", exitCode: null });
	});
});

describe("agents.retry", () => {
	test("starts a failed builder again, clears the failure, and keeps one row", async () => {
		await a.enable();
		await a.t.createTicket({ project: a.key, title: "Fix login" });
		failWs();
		expect((await start(a.ticket(1))).status).toBe(503);
		const failed = await only(`ticket=${a.ticket(1)}`);
		clearFailures();
		const done = await retry(failed.id);
		expect(done.status).toBe(200);
		expect(done.body).toMatchObject({ id: failed.id, role: "builder", state: "starting", failure: null });
		expect(done.body.workspaceId).not.toBeNull();
		expect(await a.sessions(`ticket=${a.ticket(1)}`)).toHaveLength(1);
		expect(a.sessionEvents().at(-1)).toMatchObject({ id: failed.id, state: "starting" });
	});

	test("reports the new failure when the runner refuses again", async () => {
		await a.enable();
		await a.t.createTicket({ project: a.key, title: "Fix login" });
		failWs();
		expect((await start(a.ticket(1))).status).toBe(503);
		const failed = await only(`ticket=${a.ticket(1)}`);
		a.stub.update((state) => {
			state.failures["ws create"] = "Project not found: sp-web";
		});
		const again = await retry(failed.id);
		expect(again.status).toBe(503);
		expect(again.body).toMatchObject({ data: { reason: "error", detail: "Project not found: sp-web" } });
		expect((await only(`ticket=${a.ticket(1)}`)).failure).toMatchObject({ detail: "Project not found: sp-web" });
	});

	test("starts a failed reviewer again on the pull request its row holds", async () => {
		await a.enable();
		await a.t.createTicket({ project: a.key, title: "Fix login" });
		await a.startBuilder(a.ticket(1));
		failTerminals();
		expect((await review(a.ticket(1))).status).toBe(503);
		const reviewer = (await a.sessions(`ticket=${a.ticket(1)}`)).find((found) => found.role === "reviewer")!;
		clearFailures();
		const done = await retry(reviewer.id);
		expect(done.status).toBe(200);
		expect(done.body).toMatchObject({ id: reviewer.id, role: "reviewer", state: "starting", failure: null });
		expect(a.stub.terminal(done.body.terminalId).title).toBe(`${a.ticket(1)} review`);
	});

	test("answers NOT_FOUND for a session that did not fail", async () => {
		await a.enable();
		await a.t.createTicket({ project: a.key, title: "Fix login" });
		const builder = await a.startBuilder(a.ticket(1));
		const refused = await retry(builder.id);
		expect(refused.status).toBe(404);
		expect(refused.body).toMatchObject({ code: "NOT_FOUND", data: { kind: "failedAgent", ref: builder.id } });
	});
});

describe("agents.setSettings checks the runner before it saves", () => {
	const put = (body: unknown) => a.t.api("/api/agents/settings", { method: "PUT", body });

	const rowFor = (projectId: string, overrides: Record<string, unknown> = {}) => ({
		projectId,
		enabled: true,
		supersetProjectId: null,
		baseBranch: "main",
		maxConcurrent: 3,
		removeWorkspaceOnDone: true,
		...overrides,
	});

	const settings = (projectId: string, overrides: Record<string, unknown> = {}, enabled = true) => ({
		runner: "superset",
		enabled,
		projects: [rowFor(projectId, overrides)],
	});

	const stored = async () => (await a.t.api("/api/agents/settings", { actor: null })).body;

	test("refuses a project no Superset project holds and names the project", async () => {
		const project = await a.t.seedProject(a.key);
		const before = await stored();
		const refused = await put(settings(project.id));
		expect(refused.status).toBe(409);
		expect(refused.body).toMatchObject({
			code: "AGENT_SETTINGS_UNUSABLE",
			data: { projectId: project.id, reason: "unmapped" },
		});
		expect(refused.body.data.detail).toContain("Pick a Superset project");
		expect(await stored()).toEqual(before);
	});

	test("refuses a base branch the repository does not hold", async () => {
		const project = await a.enable();
		const refused = await put(settings(project.id, { baseBranch: "master" }));
		expect(refused.status).toBe(409);
		expect(refused.body).toMatchObject({
			code: "AGENT_SETTINGS_UNUSABLE",
			data: { projectId: project.id, reason: "branch" },
		});
		expect(refused.body.data.detail).toContain("master");
		// The stored settings keep the branch that works.
		expect((await a.t.api("/api/agents/settings", { actor: null })).body.projects[0].baseBranch).toBe("main");
	});

	test("refuses a Superset project id the runner does not list", async () => {
		const project = await a.enable();
		const refused = await put(settings(project.id, { supersetProjectId: "sp-gone" }));
		expect(refused.status).toBe(409);
		expect(refused.body).toMatchObject({
			code: "AGENT_SETTINGS_UNUSABLE",
			data: { projectId: project.id, reason: "unmapped" },
		});
	});

	test("answers RUNNER_UNAVAILABLE missing when the superset binary does not exist", async () => {
		const project = await a.t.seedProject(a.key);
		a.removeBin();
		const refused = await put(settings(project.id));
		expect(refused.status).toBe(503);
		expect(refused.body).toMatchObject({ code: "RUNNER_UNAVAILABLE", data: { reason: "missing" } });
	});

	test("answers RUNNER_UNAVAILABLE error with the stderr when superset exits nonzero", async () => {
		const project = await a.t.seedProject(a.key);
		a.stub.update((state) => {
			state.failures["projects list"] = "Superset host is not running";
		});
		const refused = await put(settings(project.id));
		expect(refused.status).toBe(503);
		expect(refused.body).toMatchObject({
			code: "RUNNER_UNAVAILABLE",
			data: { reason: "error", exitCode: 1, detail: "Superset host is not running" },
		});
	});

	test("answers RUNNER_UNAVAILABLE error when the Superset project path is no git repository", async () => {
		const project = await a.enable();
		a.stub.update((state) => {
			state.projects = [{ id: "sp-web", name: "web", repo: "acme/web", path: "/nowhere/at/all" }];
		});
		const refused = await put(settings(project.id));
		expect(refused.status).toBe(503);
		expect(refused.body).toMatchObject({ code: "RUNNER_UNAVAILABLE", data: { reason: "error" } });
		expect(refused.body.data.detail).toContain("/nowhere/at/all");
	});

	test("runs no runner command while agents are off, or while every project row is off", async () => {
		const project = await a.t.seedProject(a.key);
		a.removeBin();
		expect((await put(settings(project.id, {}, false))).status).toBe(200);
		expect((await put(settings(project.id, { enabled: false }))).status).toBe(200);
		expect(a.stub.calls()).toEqual([]);
	});
});
