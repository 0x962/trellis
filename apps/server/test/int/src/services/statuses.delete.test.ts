import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import {
	type ActorRef,
	claude,
	dana,
	seedProject,
	seedRoot,
	seedRootWithStatuses,
	seedStatus,
	seedTicket,
} from "../../../fixtures";
import {
	activityRows,
	at,
	eventsOfType,
	expectError,
	type Harness,
	NOW,
	serviceHarness,
} from "../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../invariants.ts";
import * as statuses from "../../../../src/services/statuses.ts";

// A delete needs the status to be empty, or `moveTo` names the status in
// the same project that receives its tickets. A project keeps at least one
// status. When the default goes, the lowest-position survivor becomes the
// default. A moved ticket follows the started and completed rules.

let h: Harness;
beforeAll(async () => {
	h = await serviceHarness();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

const remove = (input: { project: string; status: string; moveTo?: string }) =>
	h.run((ctx, tx) => statuses.delete(ctx, tx, input));

const statusIds = (projectId: string) =>
	h
		.rows<{ id: string }>(sql`SELECT id FROM statuses WHERE project_id = ${projectId} ORDER BY position`)
		.then((rows) => rows.map((row) => row.id));

const ticketStatuses = () =>
	h.rows<{ id: string; status_id: string }>(sql`SELECT id, status_id FROM tickets ORDER BY number`);

// CDE with the six statuses and Blocked (todo) at position 6.
const seedWithBlocked = async () => {
	const { rootId: cde, statuses: s } = await seedProject(h.db, "CDE");
	const blocked = await seedStatus(h.db, { projectId: cde, name: "Blocked", category: "todo", position: 6 });
	await h.rebuild();
	return { cde, s, blocked };
};

const seedOnBlocked = async (count: number) => {
	const seeded = await seedWithBlocked();
	const tickets: string[] = [];
	for (let i = 0; i < count; i += 1) {
		tickets.push(await seedTicket(h.db, { projectId: seeded.cde, rootId: seeded.cde, statusId: seeded.blocked }));
	}
	return { ...seeded, tickets };
};

describe("statuses.delete agent policy", () => {
	const removeAs = (actor: ActorRef, input: { project: string; status: string; moveTo: string; force?: boolean }) =>
		h.run((ctx, tx) => statuses.delete(ctx, tx, input), { actor });

	test("an agent delete that moves tickets into a done status throws AGENT_CANNOT_COMPLETE", async () => {
		const { blocked } = await seedOnBlocked(2);

		await expectError(removeAs(claude, { project: "CDE", status: "blocked", moveTo: "done" }), "AGENT_CANNOT_COMPLETE");

		expect((await ticketStatuses()).map((row) => row.status_id)).toEqual([blocked, blocked]);
		expect(await statusIds((await h.one<{ id: string }>(sql`SELECT id FROM projects`)).id)).toContain(blocked);
	});

	test("force lets an agent move the tickets into a done status", async () => {
		const { s } = await seedOnBlocked(2);

		const result = await removeAs(claude, { project: "CDE", status: "blocked", moveTo: "done", force: true });

		expect(result.moved).toBe(2);
		expect((await ticketStatuses()).map((row) => row.status_id)).toEqual([s.done, s.done]);
	});

	test("an agent may move the tickets into a status outside the done category", async () => {
		const { s } = await seedOnBlocked(1);

		await removeAs(claude, { project: "CDE", status: "blocked", moveTo: "todo" });

		expect((await ticketStatuses()).map((row) => row.status_id)).toEqual([s.todo]);
	});

	test("a human moves the tickets into a done status without force", async () => {
		const { s } = await seedOnBlocked(1);

		await removeAs(dana, { project: "CDE", status: "blocked", moveTo: "done" });

		expect((await ticketStatuses()).map((row) => row.status_id)).toEqual([s.done]);
	});
});

describe("statuses.delete", () => {
	test("a status with no ticket deletes and moves nothing", async () => {
		const { cde, s, blocked } = await seedWithBlocked();
		const result = await remove({ project: "CDE", status: "blocked" });
		expect(result).toEqual({ deleted: blocked, moved: 0 });
		expect(await statusIds(cde)).toEqual(Object.values(s));
		await h.read((tx) => assertStatusInvariant(tx));
	});

	test("a status that holds tickets throws STATUS_IN_USE with the count", async () => {
		const { cde, blocked } = await seedOnBlocked(3);
		const error = await expectError(remove({ project: "CDE", status: "blocked" }), "STATUS_IN_USE");
		expect(error.data).toEqual({ count: 3 });
		expect(await statusIds(cde)).toContain(blocked);
	});

	test("moveTo carries the tickets and writes one row and one event per ticket", async () => {
		const { s, tickets } = await seedOnBlocked(3);
		const result = await remove({ project: "CDE", status: "blocked", moveTo: "in-progress" });
		expect(result.moved).toBe(3);
		expect((await ticketStatuses()).map((row) => row.status_id)).toEqual([s.started, s.started, s.started]);
		const rows = (await activityRows(h)).filter((row) => row.field === "status");
		expect(rows.map((row) => row.ticket_id).sort()).toEqual([...tickets].sort());
		const updates = eventsOfType(h.flushed, "ticket.updated");
		expect(updates.map((event) => (event.type === "ticket.updated" ? event.summary.id : "")).sort()).toEqual(
			[...tickets].sort(),
		);
		expect(eventsOfType(h.flushed, "statuses.changed")).toHaveLength(1);
		await h.read((tx) => assertStatusInvariant(tx));
	});

	test("a moveTo from another project throws STATUS_NOT_IN_PROJECT", async () => {
		const { s, blocked } = await seedOnBlocked(1);
		const ops = await seedRootWithStatuses(h.db, "OPS");
		await h.rebuild();
		const error = await expectError(
			remove({ project: "CDE", status: "blocked", moveTo: ops.statuses.started }),
			"STATUS_NOT_IN_PROJECT",
		);
		const valid = (error.data.valid as Array<{ id: string }>).map((status) => status.id);
		expect(valid).toEqual([...Object.values(s), blocked]);
	});

	test("a project keeps at least one status", async () => {
		const only = await seedRoot(h.db, "ONE");
		await seedStatus(h.db, { projectId: only, name: "Todo", category: "todo", position: 0, isDefault: true });
		await h.rebuild();
		await expectError(remove({ project: "ONE", status: "todo" }), "LAST_STATUS");
		expect(await statusIds(only)).toHaveLength(1);
	});

	test("deleting the default transfers is_default to the lowest position", async () => {
		const { cde, s } = await seedWithBlocked();
		await seedTicket(h.db, { projectId: cde, rootId: cde, statusId: s.todo });
		await remove({ project: "CDE", status: "todo", moveTo: "in-progress" });
		const defaults = await h.rows<{ id: string; position: number }>(
			sql`SELECT id, position FROM statuses WHERE project_id = ${cde} AND is_default`,
		);
		expect(defaults.map((row) => row.id)).toEqual([s.started]);
		const lowest = await h.one<{ id: string }>(
			sql`SELECT id FROM statuses WHERE project_id = ${cde} ORDER BY position LIMIT 1`,
		);
		expect(lowest.id).toBe(s.started);
		await h.read((tx) => assertStatusInvariant(tx));
	});

	test("a moved ticket follows the started and completed rules", async () => {
		const { cde, blocked } = await seedWithBlocked();
		const ticket = await seedTicket(h.db, { projectId: cde, rootId: cde, statusId: blocked });
		await remove({ project: "CDE", status: "blocked", moveTo: "done" });
		const row = await h.one<{ started_at: string | null; completed_at: string | null }>(
			sql`SELECT ${at("started_at")}, ${at("completed_at")} FROM tickets WHERE id = ${ticket}`,
		);
		expect(row).toEqual({ started_at: NOW.toISOString(), completed_at: NOW.toISOString() });
	});

	test("the status invariant holds after every delete path", async () => {
		const { cde, s, blocked } = await seedWithBlocked();
		await seedTicket(h.db, { projectId: cde, rootId: cde, statusId: blocked });
		await seedTicket(h.db, { projectId: cde, rootId: cde, statusId: s.todo });
		await remove({ project: "CDE", status: "blocked", moveTo: "todo" });
		await h.read((tx) => assertStatusInvariant(tx));
		await remove({ project: "CDE", status: "todo", moveTo: "done" });
		await h.read((tx) => assertStatusInvariant(tx));
		await remove({ project: "CDE", status: "canceled" });
		await h.read((tx) => assertStatusInvariant(tx));
		expect(await statusIds(cde)).toEqual([s.started, s.agentReview, s.humanReview, s.done]);
	});
});
