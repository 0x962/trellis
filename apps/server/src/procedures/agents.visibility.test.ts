import { describe, expect, test } from "bun:test";
import type { Activity, AgentSession } from "@trellis/api";
import { agentsHarness } from "../../test/helpers/agents.ts";
import { CLAUDE } from "../../test/helpers/app.ts";
import { gitRepo } from "../../test/helpers/gitRepo.ts";
import { flagOf } from "../../test/helpers/superset-stub.ts";

// What a person sees when an agent does not start, and the one session row
// each agent keeps. Every test works in a project of its own key.

const a = agentsHarness();

const retry = () => a.post("/api/agents/manager/retry", { project: a.key });

const register = (body: Record<string, unknown>, actor: string) =>
	a.t.api("/api/agents/register", { method: "POST", body: { project: a.key, claudeSessionId: "c-1", ...body }, actor });

const builderActor = (n: number) => `agent:builder-${a.lower}-${n}`;

// The harness seeds a manager workspace with a live manager tab. A test
// that needs a first start clears it.
const noWorkspaces = () =>
	a.stub.update((state) => {
		state.workspaces = [];
		state.terminals = [];
	});

describe("agents.retryManager", () => {
	test("records a failed start with the runner's message, then starts the manager in that row after the fix", async () => {
		await a.enable();
		noWorkspaces();
		a.stub.update((state) => {
			state.failures["ws create"] = "fatal: invalid reference: main";
		});
		const failed = await retry();
		expect(failed.status).toBe(200);
		expect(failed.body).toMatchObject({ role: "manager", state: "failed", workspaceId: null, terminalId: null });
		expect(failed.body.error).toContain("superset ws create: fatal: invalid reference: main");
		a.stub.update((state) => {
			state.failures = {};
		});
		const started = await retry();
		expect(started.body).toMatchObject({ id: failed.body.id, state: "starting", error: null });
		expect(started.body.openUrl).toBe(`superset://workspace/${started.body.workspaceId}`);
		expect((await a.sessions(`project=${a.key}`)).map((session) => session.id)).toEqual([failed.body.id]);
		expect(a.sessionEvents().map((session) => session.state)).toEqual(["failed", "starting"]);
	});

	test("answers RUNNER_UNAVAILABLE disabled when agents are off for the project, and records nothing", async () => {
		await a.enable({ enabled: false });
		const refused = await retry();
		expect(refused.status).toBe(503);
		expect(refused.body).toMatchObject({ code: "RUNNER_UNAVAILABLE", data: { reason: "disabled" } });
		expect(await a.sessions(`project=${a.key}`)).toEqual([]);
	});
});

describe("one row per agent", () => {
	test("a builder that registers from another terminal of its workspace updates its starting row and keeps its openUrl", async () => {
		await a.enable();
		await a.t.createTicket({ project: a.key, title: "Fix login" });
		const started = await a.startBuilder(a.ticket(1));
		const registered = await register(
			{ role: "builder", ticket: a.ticket(1), workspaceId: started.workspaceId, terminalId: "t-claude" },
			builderActor(1),
		);
		expect(registered.status).toBe(200);
		expect(registered.body).toMatchObject({
			id: started.id,
			state: "running",
			terminalId: "t-claude",
			openUrl: started.openUrl,
		});
		expect((await a.sessions(`ticket=${a.ticket(1)}`)).map((session) => session.id)).toEqual([started.id]);
	});

	test("a manager that registers from another terminal of its workspace updates the manager row: no exited row", async () => {
		await a.enable();
		const manager = (await retry()).body as AgentSession;
		const registered = await register(
			{ role: "manager", workspaceId: a.tab.workspaceId, terminalId: "t-claude" },
			a.manager,
		);
		expect(registered.body).toMatchObject({
			id: manager.id,
			state: "running",
			terminalId: "t-claude",
			openUrl: manager.openUrl,
		});
		const all = await a.sessions(`project=${a.key}`);
		expect(all.map(({ id, state }) => ({ id, state }))).toEqual([{ id: manager.id, state: "running" }]);
	});

	test("the builder limit counts one per ticket with a live builder: a second live row and a stopped row never count", async () => {
		await a.enable({ maxConcurrent: 2 });
		for (const title of ["One", "Two", "Three"]) await a.t.createTicket({ project: a.key, title });
		for (const workspaceId of ["ws-x1", "ws-x2"]) {
			const body = { role: "builder", ticket: a.ticket(1), workspaceId, terminalId: `t-${workspaceId}` };
			expect((await register(body, builderActor(1))).status).toBe(200);
		}
		const second = await register(
			{ role: "builder", ticket: a.ticket(2), workspaceId: "ws-x3", terminalId: "t-x3" },
			builderActor(2),
		);
		expect((await a.post(`/api/agents/sessions/${second.body.id}/stop`, {})).status).toBe(200);
		const started = await a.post("/api/agents/builder", { ticket: a.ticket(3) });
		expect(started.status).toBe(200);
		const refused = await a.post("/api/agents/builder", { ticket: a.ticket(2) });
		expect(refused.status).toBe(409);
		expect(refused.body).toMatchObject({ code: "CONCURRENCY_LIMIT", data: { limit: 2, running: 2 } });
	});
});

describe("agents.overview", () => {
	test("lists every session and the actions of the manager, builder, and reviewer agents, newest first", async () => {
		const project = await a.enable();
		const manager = await a.registerManager();
		await a.t.createTicket({ project: a.key, title: "By navid" });
		await a.t.createTicket({ project: a.key, title: "By the manager" }, a.manager);
		await a.t.createTicket({ project: a.key, title: "By claude" }, CLAUDE);
		await a.t.createTicket({ project: a.key, title: "By a builder" }, builderActor(1));
		const response = await a.t.api("/api/agents/overview", { actor: null });
		expect(response.status).toBe(200);
		expect(response.body.sessions.map((session: AgentSession) => session.id)).toContain(manager.id);
		const mine = (response.body.actions as Activity[]).filter((action) => action.projectId === project.id);
		expect([...new Set(mine.map((action) => action.actor.name))]).toEqual([
			`builder-${a.lower}-1`,
			`manager-${a.lower}`,
		]);
		const named = response.body.tickets.map((ticket: { identifier: string }) => ticket.identifier);
		expect(named).toContain(a.ticket(2));
		expect(named).toContain(a.ticket(4));
	});

	test("holds at most the last 50 agent actions", async () => {
		await a.enable();
		for (let n = 1; n <= 51; n++) await a.t.createTicket({ project: a.key, title: `Ticket ${n}` }, a.manager);
		const actions = (await a.t.api("/api/agents/overview", { actor: null })).body.actions as Activity[];
		expect(actions).toHaveLength(50);
		expect(actions.every((action) => action.actor.name === `manager-${a.lower}`)).toBe(true);
		expect(actions.map((action) => action.id)).toEqual([...actions.map((action) => action.id)].sort((x, y) => y - x));
	});
});

describe("the base branch default", () => {
	test("a project without a base branch starts its agents from the default branch of the Superset checkout", async () => {
		const path = gitRepo("master");
		a.stub.update((state) => {
			state.projects[0]!.path = path;
		});
		await a.enable({ baseBranch: null });
		await a.t.createTicket({ project: a.key, title: "Fix login" });
		await a.startBuilder(a.ticket(1));
		await retry();
		expect(a.stub.callsOf("ws create").map((call) => flagOf(call, "--base-branch"))).toEqual(["master", "master"]);
	});

	test("agents.runnerProjects names the default branch of each Superset project, or null when git cannot read it", async () => {
		const develop = gitRepo("develop");
		const bare = gitRepo(null);
		a.stub.update((state) => {
			state.projects = [
				{ ...state.projects[0]!, path: develop },
				{ id: "sp-bare", name: "bare", repo: "acme/bare", path: bare },
			];
		});
		await a.enable();
		const listed = (await a.t.api("/api/agents/runner-projects", { actor: null })).body;
		expect(
			listed.projects.map((project: { id: string; defaultBranch: string | null }) => project.defaultBranch),
		).toEqual(["develop", null]);
	});
});
