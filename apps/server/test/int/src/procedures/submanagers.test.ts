import { afterEach, beforeEach, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { createTestApp, type TestApp } from "../../../helpers/app.ts";
import { assertStatusInvariant } from "../../../invariants.ts";

let t: TestApp;
beforeEach(async () => {
	t = await createTestApp();
});
afterEach(async () => {
	await t.serverTx(assertStatusInvariant);
	await t.close();
});

test("delegation budgets round-trip through REST and RPC while human agent lists stay quiet", async () => {
	const project = await t.seedProject("DEL");
	const child = await t.client.projects.create({ parent: project.id, name: "Child", slug: "child" });
	const persona = await t.client.personas.create({ name: "Manager", kind: "manager", instruction: "Manage." });
	const parentId = ulid();
	const runId = ulid();
	await t.editServerTx(async (tx) => {
		for (const [id, projectId] of [
			[parentId, project.id],
			[runId, child.id],
		])
			await tx.execute(sql`INSERT INTO agent_runs (id,name,persona_id,persona_name,kind,instruction,project_id,project_path,created_at,updated_at)
				VALUES (${id},'Manager',${persona.id},'Manager','manager','Manage.',${projectId},'DEL',now(),now())`);
		await tx.execute(sql`INSERT INTO manager_delegations (run_id,parent_run_id,project_id,capacity,brief,created_at)
			VALUES (${runId},${parentId},${child.id},2,'Finish child work.',now())`);
		await tx.execute(sql`INSERT INTO manager_dispatches (id,project_id,run_id,events,due_at,created_at,updated_at)
			VALUES ('delegated-dispatch',${child.id},${runId},'[]'::jsonb,now(),now(),now())`);
	});
	const response = await t.api("/api/submanagers");
	expect(response.status, JSON.stringify(response.body)).toBe(200);
	expect(response.body).toEqual([
		{
			runId,
			parentRunId: parentId,
			projectId: child.id,
			capacity: 2,
			brief: "Finish child work.",
			retiredAt: null,
			activeWorkers: 0,
			childCapacity: 0,
		},
	]);
	expect((await t.client.agentRuns.list({})).map((run) => run.id)).toEqual([parentId]);
	expect((await t.as(`agent:${parentId}`).agentRuns.list({})).map((run) => run.id)).toContain(runId);
	expect(await t.client.controller.list({})).toEqual([]);
	expect((await t.as(`agent:${parentId}`).controller.list({}))[0]?.id).toBe("delegated-dispatch");
	expect((await t.client.submanagers.resize({ id: runId, capacity: 4 })).capacity).toBe(4);
	expect((await t.api(`/api/submanagers/${runId}`, { method: "PATCH", body: { capacity: 0 } })).status).toBe(400);
	expect((await t.client.submanagers.list({}))[0]?.capacity).toBe(4);
	expect((await t.as(`agent:${parentId}`).submanagers.list({}))[0]?.runId).toBe(runId);
});

test("only an active manager can start a delegation", async () => {
	const response = await t.api("/api/submanagers", {
		method: "POST",
		body: { project: "APP/child", capacity: 2, brief: "Own this scope.", requestId: "request" },
	});
	expect(response.status).toBe(400);
	expect(await t.client.submanagers.list({})).toEqual([]);
});
