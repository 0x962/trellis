import { describe, expect, test } from "bun:test";
import { type ActorRef, claude, count, navid, seedProject, seedTicket } from "../../test/fixtures";
import {
	activityOf,
	expectErrorData,
	millis,
	ticketHarness,
	ticketRow,
	traceRows,
} from "../../test/helpers/services.ts";
import * as tickets from "./tickets.ts";

const h = ticketHarness();

const move = (actor: ActorRef, input: Record<string, unknown>) =>
	h.as(actor)((ctx, tx) => tickets.move(ctx, tx, input));

// A root with its six statuses and `n` tickets in In Progress.
const seed = async (n = 1) => {
	const { rootId, statuses } = await seedProject(h.db);
	const ids: string[] = [];
	for (let i = 0; i < n; i += 1) {
		ids.push(await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.started }));
	}
	return { rootId, statuses, ids, id: ids[0]! };
};

describe("agent policy", () => {
	test("an agent move to a done status throws AGENT_CANNOT_COMPLETE", async () => {
		const { statuses, id } = await seed();
		const data = await expectErrorData(move(claude, { ticket: id, status: "done" }), "AGENT_CANNOT_COMPLETE");
		expect(data.status.id).toBe(statuses.done);
		expect((await ticketRow(h.db, id))!.status_id).toBe(statuses.started);
	});

	test("force lets an agent move a ticket to a done status", async () => {
		const { statuses, id } = await seed();
		const before = Date.now();
		await move(claude, { ticket: id, status: "done", force: true });
		const row = (await ticketRow(h.db, id))!;
		expect(row.status_id).toBe(statuses.done);
		expect(millis(row.completed_at)).toBeGreaterThanOrEqual(before);
		const statusRow = (await activityOf(h.db, id)).find((activity) => activity.field === "status");
		expect(statusRow).toMatchObject({ actor_name: "claude", actor_kind: "agent" });
	});

	test("an agent update to a done status throws AGENT_CANNOT_COMPLETE", async () => {
		const { statuses, id } = await seed();
		await expectErrorData(
			h.as(claude)((ctx, tx) => tickets.update(ctx, tx, { ticket: id, status: "done" })),
			"AGENT_CANNOT_COMPLETE",
		);
		expect((await ticketRow(h.db, id))!.status_id).toBe(statuses.started);
	});

	test("an agent may move a ticket to a canceled status", async () => {
		const { statuses, id } = await seed();
		const { result: ticket } = await move(claude, { ticket: id, status: "canceled" });
		expect(ticket.status.id).toBe(statuses.canceled);
	});

	test("a human moves a ticket to a done status without force", async () => {
		const { statuses, id } = await seed();
		const { result: ticket } = await move(navid, { ticket: id, status: "done" });
		expect(ticket.status.id).toBe(statuses.done);
	});

	test("an agent delete throws AGENT_CANNOT_DELETE", async () => {
		const { id } = await seed();
		await expectErrorData(
			h.as(claude)((ctx, tx) => tickets.delete(ctx, tx, { ticket: id })),
			"AGENT_CANNOT_DELETE",
		);
		expect(await ticketRow(h.db, id)).toBeDefined();
	});

	test("force lets an agent delete a ticket", async () => {
		const { id } = await seed();
		await h.as(claude)((ctx, tx) => tickets.delete(ctx, tx, { ticket: id, force: true }));
		expect(await ticketRow(h.db, id)).toBeUndefined();
		const traces = await traceRows(h.db);
		expect(traces).toHaveLength(1);
		expect(traces[0]).toMatchObject({ action: "ticket.deleted", actor_name: "claude", actor_kind: "agent" });
	});

	test("an agent updateMany to a done status throws AGENT_CANNOT_COMPLETE", async () => {
		const { statuses, ids } = await seed(3);
		await expectErrorData(
			h.as(claude)((ctx, tx) => tickets.updateMany(ctx, tx, { tickets: ids, status: "done" })),
			"AGENT_CANNOT_COMPLETE",
		);
		for (const id of ids) expect((await ticketRow(h.db, id))!.status_id).toBe(statuses.started);
	});

	test("an agent deleteMany throws AGENT_CANNOT_DELETE", async () => {
		const { ids } = await seed(3);
		await expectErrorData(
			h.as(claude)((ctx, tx) => tickets.deleteMany(ctx, tx, { tickets: ids })),
			"AGENT_CANNOT_DELETE",
		);
		expect(await count(h.db, "tickets")).toBe(3);
	});
});
