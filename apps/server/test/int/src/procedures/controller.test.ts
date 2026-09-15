import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { createTestApp, type TestApp } from "../../../helpers/app.ts";
import { assertStatusInvariant } from "../../../invariants.ts";

let t: TestApp;
beforeAll(async () => {
	t = await createTestApp();
});
afterAll(() => t.close());
afterEach(() => t.serverTx(assertStatusInvariant));

test("manager outcomes pass through REST and RPC and reject invalid boundary input", async () => {
	const project = await t.client.projects.create({ key: "ACK", name: "Acknowledgments" });
	await t.editServerTx(async (tx) => {
		await tx.execute(sql`INSERT INTO manager_dispatches (id,project_id,generation,state,events,due_at,created_at,updated_at)
			VALUES ('dispatch',${project.id},3,'sent','[]'::jsonb,now(),now(),now())`);
	});
	const input = {
		generation: 3,
		outcomes: [{ ticketId: null, status: "no_action", reason: "Every open ticket has an owner." }],
	};
	const denied = await t.api("/api/manager-dispatches/dispatch/handle", { method: "POST", actor: null, body: input });
	expect(denied.status).toBe(400);
	const invalid = await t.api("/api/manager-dispatches/dispatch/handle", {
		method: "POST",
		body: { ...input, outcomes: [] },
	});
	expect(invalid.status).toBe(400);
	const before = await t.client.controller.list({ projectId: project.id, unhandled: true });
	expect(before).toHaveLength(1);
	expect(before[0]!.workState).toBe("open");
	const result = await t.api("/api/manager-dispatches/dispatch/handle", { method: "POST", body: input });
	expect(result.status).toBe(200);
	expect(result.body.workState).toBe("handled");
	expect(result.body.outcomes).toEqual(input.outcomes);
	expect(await t.client.controller.list({ projectId: project.id, unhandled: true })).toEqual([]);
});
