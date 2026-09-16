import { afterEach, beforeEach, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { createTestApp, type TestApp } from "../../../helpers/app.ts";
import { assertStatusInvariant } from "../../../invariants.ts";

let t: TestApp;
let sequence = 0;
beforeEach(async () => {
	t = await createTestApp();
});
afterEach(async () => {
	await t.serverTx(assertStatusInvariant);
	await t.close();
});
const fixture = async () => {
	const project = await t.client.projects.create({ key: `WA${++sequence}`, name: `Waits ${sequence}` });
	const ticket = await t.client.tickets.create({ project: project.id, title: "Deferred work" });
	const id = `dispatch-${sequence}`;
	await t.editServerTx(async (tx) => {
		const events = [
			{
				id: 1,
				ticketId: ticket.id,
				action: "ticket.created",
				actor: { name: "dana", kind: "human" },
				createdAt: new Date().toISOString(),
			},
		];
		await tx.execute(sql`INSERT INTO manager_dispatches (id,project_id,generation,state,events,due_at,created_at,updated_at)
			VALUES (${id},${project.id},1,'sent',${JSON.stringify(events)}::jsonb,now(),now(),now())`);
	});
	return { project, ticket, id };
};

test("RPC and REST retain each explicit wake condition", async () => {
	for (const kind of ["time", "dependency", "human_response"] as const) {
		const { project, ticket, id } = await fixture();
		const dependency = await t.client.tickets.create({ project: project.id, title: "Prerequisite" });
		const question = await t.client.comments.create({ ticket: ticket.id, body: "Which option?" });
		const waitFor =
			kind === "time"
				? { type: kind, at: "2030-01-01T10:00:00-05:00" }
				: kind === "dependency"
					? { type: kind, ticketId: dependency.id }
					: { type: kind, commentId: question.id };
		const result = await t.client.controller.handle({
			id,
			generation: 1,
			outcomes: [{ ticketId: ticket.id, status: "blocked", reason: "Revisit after this condition.", waitFor }],
		});
		expect(result.outcomes[0]?.waitFor).toEqual(waitFor);
		const response = await t.api(`/api/manager-actions?projectId=${project.id}&state=waiting`);
		expect(response.status).toBe(200);
		expect(response.body[0]).toMatchObject({ wakeCondition: kind, waitFor, ticketId: ticket.id });
	}
});

test("the API rejects malformed or misplaced wait conditions before recording an outcome", async () => {
	const { ticket, id } = await fixture();
	for (const override of [
		{ waitFor: { type: "time", at: "tomorrow" } },
		{ waitFor: { type: "time", at: "2030-01-01T10:00:00" } },
		{ waitFor: { type: "dependency", ticketId: "" } },
		{ waitFor: { type: "human_response", commentId: "" } },
		{ waitFor: { type: "unknown" } },
		{ status: "assigned", waitFor: { type: "time", at: "2030-01-01T00:00:00Z" } },
		{ ticketId: null, waitFor: { type: "time", at: "2030-01-01T00:00:00Z" } },
	]) {
		const result = await t.api(`/api/manager-dispatches/${id}/handle`, {
			method: "POST",
			body: { generation: 1, outcomes: [{ ticketId: ticket.id, status: "blocked", reason: "Wait.", ...override }] },
		});
		expect(result.status).toBe(400);
	}
	expect((await t.client.controller.list({})).find((row) => row.id === id)?.outcomes).toEqual([]);
});

test("human-response waits require a root question on the deferred ticket", async () => {
	const { project, ticket, id } = await fixture();
	const other = await t.client.tickets.create({ project: project.id, title: "Other ticket" });
	const foreign = await t.client.comments.create({ ticket: other.id, body: "Another question." });
	const root = await t.client.comments.create({ ticket: ticket.id, body: "This question." });
	const reply = await t.client.comments.create({ ticket: ticket.id, body: "A reply.", parentId: root.id });
	for (const commentId of [foreign.id, reply.id]) {
		await expect(
			t.client.controller.handle({
				id,
				generation: 1,
				outcomes: [
					{
						ticketId: ticket.id,
						status: "blocked",
						reason: "Wait.",
						waitFor: { type: "human_response", commentId },
					},
				],
			}),
		).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
	}
});
