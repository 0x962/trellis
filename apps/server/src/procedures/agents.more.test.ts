import { describe, expect, test } from "bun:test";
import { agentsHarness } from "../../test/helpers/agents.ts";

// The agents procedures beyond the contract cases: the project a runner
// cannot map, an archived project, a runner failure, and the builder's
// workspace after its ticket is done. Every test works in a project of its
// own key.

const a = agentsHarness();

const start = (ticket: string) => a.post("/api/agents/builder", { ticket });

const stop = (id: string) => a.post(`/api/agents/sessions/${id}/stop`, {});

describe("agents.startBuilder refusals", () => {
	test("answers RUNNER_UNAVAILABLE unmapped when no Superset project holds a declared repo", async () => {
		await a.enable();
		await a.t.createTicket({ project: a.key, title: "Fix login" });
		a.stub.update((state) => {
			state.projects = [{ id: "sp-other", name: "other", repo: "acme/other", path: a.repoPath }];
		});
		const refused = await start(a.ticket(1));
		expect(refused.status).toBe(503);
		expect(refused.body).toMatchObject({ code: "RUNNER_UNAVAILABLE", data: { reason: "unmapped" } });
		expect(a.stub.callsOf("ws create")).toEqual([]);
	});

	test("a Superset project id in the settings wins over the repo match", async () => {
		a.stub.update((state) => {
			state.projects.push({ id: "sp-chosen", name: "chosen", repo: "acme/chosen", path: a.repoPath });
		});
		await a.enable({ supersetProjectId: "sp-chosen" });
		await a.t.createTicket({ project: a.key, title: "Fix login" });
		a.stub.clearCalls();
		expect((await start(a.ticket(1))).status).toBe(200);
		expect(a.stub.callsOf("projects list")).toEqual([]);
		expect(a.stub.state().workspaces.at(-1)!.projectId).toBe("sp-chosen");
	});

	test("answers PROJECT_ARCHIVED for a ticket in an archived project", async () => {
		await a.enable();
		await a.t.createTicket({ project: a.key, title: "Fix login" });
		const archived = await a.t.api(`/api/projects/${a.key}`, { method: "PATCH", body: { archived: true } });
		expect(archived.status).toBe(200);
		a.stub.clearCalls();
		const refused = await start(a.ticket(1));
		expect(refused.status).toBe(409);
		expect(refused.body.code).toBe("PROJECT_ARCHIVED");
		expect(a.stub.calls()).toEqual([]);
	});

	test("a runner error answers RUNNER_UNAVAILABLE error and does not count toward the limit", async () => {
		await a.enable({ maxConcurrent: 1 });
		await a.t.createTicket({ project: a.key, title: "Fix login" });
		a.stub.update((state) => {
			state.failures["ws create"] = "Project not found: sp-web";
		});
		const refused = await start(a.ticket(1));
		expect(refused.status).toBe(503);
		expect(refused.body).toMatchObject({ code: "RUNNER_UNAVAILABLE", data: { reason: "error" } });
		expect(refused.body.message).toContain("Project not found: sp-web");
		expect(await a.sessions(`project=${a.key}`)).toMatchObject([{ state: "failed" }]);
		a.stub.update((state) => {
			delete state.failures["ws create"];
		});
		expect((await start(a.ticket(1))).status).toBe(200);
	});

	test("answers NOT_FOUND for a reviewer of a ticket without a builder workspace", async () => {
		await a.enable();
		await a.t.createTicket({ project: a.key, title: "Fix login" });
		const refused = await a.post("/api/agents/reviewer", {
			ticket: a.ticket(1),
			prUrl: "https://github.com/acme/web/pull/7",
		});
		expect(refused.status).toBe(404);
		expect(refused.body).toMatchObject({ code: "NOT_FOUND", data: { kind: "builder", ref: a.ticket(1) } });
	});
});

describe("agents.runnerProjects", () => {
	const list = () => a.t.api("/api/agents/runner-projects", { actor: null });

	test("server builder: agents.runnerProjects lists the projects of superset projects list and matches each trellis project by its declared repo", async () => {
		const project = await a.enable();
		const other = await a.t.seedProject(`${a.key}X`);
		const listed = await list();
		expect(listed.status).toBe(200);
		expect(listed.body.projects).toEqual([{ id: "sp-web", name: "web", repo: "acme/web", path: a.repoPath }]);
		expect(listed.body.matches).toContainEqual({ projectId: project.id, runnerProjectId: "sp-web" });
		const matched = listed.body.matches.map((match: { projectId: string }) => match.projectId);
		expect(matched).not.toContain(other.id);
	});

	test("server builder: agents.runnerProjects answers RUNNER_UNAVAILABLE missing when the superset binary does not exist", async () => {
		a.removeBin();
		const refused = await list();
		expect(refused.status).toBe(503);
		expect(refused.body).toMatchObject({ code: "RUNNER_UNAVAILABLE", data: { reason: "missing" } });
	});
});

describe("agents.stop and the builder's workspace", () => {
	const moveToDone = async (ticket: string) => {
		const moved = await a.t.api(`/api/tickets/${ticket}/move`, { method: "POST", body: { status: "done" } });
		expect(moved.status).toBe(200);
	};

	test("stopping the builder of a done ticket removes its workspace and stops every agent in it", async () => {
		await a.enable();
		await a.t.createTicket({ project: a.key, title: "Fix login" });
		const builder = (await start(a.ticket(1))).body;
		const reviewer = await a.post("/api/agents/reviewer", {
			ticket: a.ticket(1),
			prUrl: "https://github.com/acme/web/pull/7",
		});
		await moveToDone(a.ticket(1));
		const stopped = await stop(builder.id);
		expect(stopped.body.state).toBe("stopped");
		expect(a.stub.callsOf("ws delete")).toEqual([["ws", "delete", builder.workspaceId, "--local"]]);
		const states = (await a.sessions(`ticket=${a.ticket(1)}`)).map(({ id, state }) => ({ id, state }));
		expect(states).toEqual([
			{ id: builder.id, state: "stopped" },
			{ id: reviewer.body.id, state: "stopped" },
		]);
	});

	test("the workspace stays when the setting keeps it, or when the ticket is not done", async () => {
		await a.enable({ removeWorkspaceOnDone: false });
		await a.t.createTicket({ project: a.key, title: "One" });
		await a.t.createTicket({ project: a.key, title: "Two" });
		const kept = (await start(a.ticket(1))).body;
		await moveToDone(a.ticket(1));
		await stop(kept.id);
		const open = (await start(a.ticket(2))).body;
		await stop(open.id);
		expect(a.stub.callsOf("ws delete")).toEqual([]);
		expect(a.stub.callsOf("terminals close")).toHaveLength(2);
	});

	test("stopping a stopped session calls no runner and changes nothing", async () => {
		await a.enable();
		await a.t.createTicket({ project: a.key, title: "Fix login" });
		const builder = (await start(a.ticket(1))).body;
		await stop(builder.id);
		const calls = a.stub.calls().length;
		const again = await stop(builder.id);
		expect(again.body.state).toBe("stopped");
		expect(a.stub.calls()).toHaveLength(calls);
	});
});
