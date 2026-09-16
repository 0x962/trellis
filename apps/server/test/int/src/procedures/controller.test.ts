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

test("a queued outcome creates a next action through RPC and REST can cancel it", async () => {
	const project = await t.client.projects.create({ key: "NXT", name: "Next actions" });
	const ticket = await t.client.tickets.create({ project: project.id, title: "Capacity wait" });
	await t.editServerTx(async (tx) => {
		await tx.execute(sql`INSERT INTO manager_dispatches (id,project_id,generation,state,events,due_at,created_at,updated_at)
			VALUES ('capacity',${project.id},1,'sent',${JSON.stringify([{ id: 1, ticketId: ticket.id, action: "ticket.created", actor: { name: "dana", kind: "human" }, createdAt: new Date().toISOString() }])}::jsonb,now(),now(),now())`);
	});
	await t.client.controller.handle({
		id: "capacity",
		generation: 1,
		outcomes: [{ ticketId: ticket.id, status: "queued", reason: "Wait for a worker." }],
	});
	const actions = await t.client.controller.actions({ projectId: project.id, state: "waiting" });
	expect(actions).toHaveLength(1);
	expect(actions[0]).toMatchObject({ ticketId: ticket.id, state: "waiting", runId: null });
	const canceled = await t.api(`/api/manager-actions/${actions[0]!.id}/cancel`, { method: "POST", body: {} });
	expect(canceled.status).toBe(200);
	expect(canceled.body.state).toBe("canceled");
	expect(await t.client.controller.actions({ projectId: project.id, state: "waiting" })).toEqual([]);
});
