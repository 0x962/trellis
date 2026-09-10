import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { agentsHarness, MANAGER } from "../../test/helpers/agents.ts";

// The agents procedures beyond the contract cases: the project a runner
// cannot map, an archived project, a runner failure, and the builder's
// workspace after its ticket is done.

const a = agentsHarness();

const start = (ticket: string) =>
	a.t.api("/api/agents/builder", { method: "POST", body: { ticket }, actor: MANAGER });

const sessionCount = async () =>
	(await a.db.execute(sql`SELECT count(*)::int AS n FROM agent_sessions`)).rows[0]!.n as number;

describe("agents.startBuilder refusals", () => {
	test("answers RUNNER_UNAVAILABLE unmapped when no Superset project holds a declared repo", async () => {
		await a.enable();
		await a.t.createTicket({ project: "CDE", title: "Fix login" });
		a.stub.update((state) => {
			state.projects = [{ id: "sp-other", name: "other", repo: "acme/other", path: "/src/other" }];
		});
		const refused = await start("CDE-1");
		expect(refused.status).toBe(503);
		expect(refused.body).toMatchObject({ code: "RUNNER_UNAVAILABLE", data: { reason: "unmapped" } });
		expect(a.stub.callsOf("ws create")).toEqual([]);
	});

	test("a Superset project id in the settings wins over the repo match", async () => {
		await a.enable({ supersetProjectId: "sp-chosen" });
		await a.t.createTicket({ project: "CDE", title: "Fix login" });
		expect((await start("CDE-1")).status).toBe(200);
		expect(a.stub.callsOf("projects list")).toEqual([]);
		expect(a.stub.state().workspaces.at(-1)!.projectId).toBe("sp-chosen");
	});

	test("answers PROJECT_ARCHIVED for a ticket in an archived project", async () => {
		await a.enable();
		await a.t.createTicket({ project: "CDE", title: "Fix login" });
		const archived = await a.t.api("/api/projects/CDE", { method: "PATCH", body: { archived: true } });
		expect(archived.status).toBe(200);
		const refused = await start("CDE-1");
		expect(refused.status).toBe(409);
		expect(refused.body.code).toBe("PROJECT_ARCHIVED");
		expect(a.stub.calls()).toEqual([]);
	});

	test("a runner error answers RUNNER_UNAVAILABLE error, leaves no session, and does not count toward the limit", async () => {
		await a.enable({ maxConcurrent: 1 });
		await a.t.createTicket({ project: "CDE", title: "Fix login" });
		a.stub.update((state) => {
			state.failures["ws create"] = "Project not found: sp-web";
		});
		const refused = await start("CDE-1");
		expect(refused.status).toBe(503);
		expect(refused.body).toMatchObject({ code: "RUNNER_UNAVAILABLE", data: { reason: "error" } });
		expect(refused.body.message).toContain("Project not found: sp-web");
		expect(await sessionCount()).toBe(0);
		a.stub.update((state) => {
			delete state.failures["ws create"];
		});
		expect((await start("CDE-1")).status).toBe(200);
	});

	test("answers NOT_FOUND for a reviewer of a ticket without a builder workspace", async () => {
		await a.enable();
		await a.t.createTicket({ project: "CDE", title: "Fix login" });
		const refused = await a.t.api("/api/agents/reviewer", {
			method: "POST",
			body: { ticket: "CDE-1", prUrl: "https://github.com/acme/web/pull/7" },
			actor: MANAGER,
		});
		expect(refused.status).toBe(404);
		expect(refused.body).toMatchObject({ code: "NOT_FOUND", data: { kind: "builder", ref: "CDE-1" } });
	});
});

describe("agents.stop and the builder's workspace", () => {
	const moveToDone = async (ticket: string) => {
		const moved = await a.t.api(`/api/tickets/${ticket}/move`, { method: "POST", body: { status: "done" } });
		expect(moved.status).toBe(200);
	};

	test("stopping the builder of a done ticket removes its workspace and stops every agent in it", async () => {
		await a.enable();
		await a.t.createTicket({ project: "CDE", title: "Fix login" });
		const builder = (await start("CDE-1")).body;
		const reviewer = await a.t.api("/api/agents/reviewer", {
			method: "POST",
			body: { ticket: "CDE-1", prUrl: "https://github.com/acme/web/pull/7" },
			actor: MANAGER,
		});
		await moveToDone("CDE-1");
		const stopped = await a.t.api(`/api/agents/sessions/${builder.id}/stop`, { method: "POST", body: {}, actor: MANAGER });
		expect(stopped.body.state).toBe("stopped");
		expect(a.stub.callsOf("ws delete")).toEqual([["ws", "delete", builder.workspaceId, "--local"]]);
		const states = await a.db.execute(sql`SELECT id, state FROM agent_sessions ORDER BY created_at, id`);
		expect(states.rows).toEqual([
			{ id: builder.id, state: "stopped" },
			{ id: reviewer.body.id, state: "stopped" },
		]);
	});

	test("the workspace stays when the setting keeps it, or when the ticket is not done", async () => {
		await a.enable({ removeWorkspaceOnDone: false });
		await a.t.createTicket({ project: "CDE", title: "One" });
		await a.t.createTicket({ project: "CDE", title: "Two" });
		const kept = (await start("CDE-1")).body;
		await moveToDone("CDE-1");
		await a.t.api(`/api/agents/sessions/${kept.id}/stop`, { method: "POST", body: {}, actor: MANAGER });
		const open = (await start("CDE-2")).body;
		await a.t.api(`/api/agents/sessions/${open.id}/stop`, { method: "POST", body: {}, actor: MANAGER });
		expect(a.stub.callsOf("ws delete")).toEqual([]);
		expect(a.stub.callsOf("terminals close")).toHaveLength(2);
	});

	test("stopping a stopped session calls no runner and changes nothing", async () => {
		await a.enable();
		await a.t.createTicket({ project: "CDE", title: "Fix login" });
		const builder = (await start("CDE-1")).body;
		await a.t.api(`/api/agents/sessions/${builder.id}/stop`, { method: "POST", body: {}, actor: MANAGER });
		const calls = a.stub.calls().length;
		const again = await a.t.api(`/api/agents/sessions/${builder.id}/stop`, { method: "POST", body: {}, actor: MANAGER });
		expect(again.body.state).toBe("stopped");
		expect(a.stub.calls()).toHaveLength(calls);
	});
});
