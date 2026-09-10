import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { hoursAgo, navid, seedActors, seedProject, seedRoot, seedStatuses, seedTicket } from "../../test/fixtures";
import { activityRows, at, expectError, query, serviceHarness, ticketRow } from "../../test/helpers/services.ts";
import * as tickets from "./tickets.ts";

const h = serviceHarness();

const move = (input: Record<string, unknown>) => h.as(navid)((ctx, tx) => tickets.move(ctx, tx, input));

// A root with its six statuses, tickets a, b, c in In Progress at the
// positions given, and ticket x in Todo at 1024. `xSeed` sets the fixture
// fields of x; `xColumns` sets columns the fixture holds fixed, such as
// `version`.
const seed = async (
	positions = [1024, 2048, 3072],
	xSeed: Record<string, unknown> = {},
	xColumns: Record<string, unknown> = {},
) => {
	const { rootId, statuses } = await seedProject(h.db);
	const base = { projectId: rootId, rootId };
	const column: string[] = [];
	for (const position of positions) {
		column.push(await seedTicket(h.db, { ...base, statusId: statuses.started, position }));
	}
	const x = await seedTicket(h.db, { ...base, statusId: statuses.todo, position: 1024, ...xSeed }, xColumns);
	return { rootId, statuses, column, x };
};

const columnOrder = (statusId: string) =>
	query<{ id: string; position: number }>(
		h.db,
		sql`SELECT id, position FROM tickets WHERE status_id = ${statusId} ORDER BY position, id`,
	);

describe("tickets.move", () => {
	test("a move without anchors puts the ticket last in the target column", async () => {
		const { statuses, column, x } = await seed();
		const { result: ticket } = await move({ ticket: x, status: "in-progress" });
		expect(ticket.position).toBe(4096);
		expect((await columnOrder(statuses.started)).map((row) => row.id)).toEqual([...column, x]);
	});

	test("a move with after takes the midpoint below the next neighbour", async () => {
		const { column, x } = await seed();
		const { result: ticket } = await move({ ticket: x, status: "in-progress", after: column[0] });
		expect(ticket.position).toBe(1536);
	});

	test("a move with before puts the ticket above the anchor", async () => {
		const { statuses, column, x } = await seed();
		const { result: ticket } = await move({ ticket: x, status: "in-progress", before: column[0] });
		expect(ticket.position).toBeLessThan(1024);
		expect((await columnOrder(statuses.started))[0]?.id).toBe(x);
	});

	test("a move with both anchors takes the midpoint of the pair", async () => {
		const { column, x } = await seed([1024, 2048]);
		const { result: ticket } = await move({ ticket: x, status: "in-progress", after: column[0], before: column[1] });
		expect(ticket.position).toBe(1536);
	});

	test("INVALID_ANCHOR for an anchor in another column", async () => {
		const { rootId, statuses, x } = await seed();
		const inTodo = await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo, position: 2048 });
		await expectError(move({ ticket: x, status: "in-progress", after: inTodo }), "INVALID_ANCHOR");
		expect((await ticketRow(h.db, x))!).toMatchObject({ status_id: statuses.todo, position: 1024 });
	});

	test("a gap under the threshold renumbers the column in steps of 1024", async () => {
		const { statuses, column, x } = await seed([1000, 1000.5, 3000]);
		await move({ ticket: x, status: "in-progress", after: column[0], before: column[1] });
		const order = await columnOrder(statuses.started);
		expect(order.map((row) => row.id)).toEqual([column[0]!, x, column[1]!, column[2]!]);
		expect(order.map((row) => row.position)).toEqual([1024, 2048, 3072, 4096]);
	});

	test("a reorder bumps the version but not updated_at", async () => {
		const { rootId, statuses, column } = await seed();
		const updatedAt = hoursAgo(1);
		const y = await seedTicket(
			h.db,
			{ projectId: rootId, rootId, statusId: statuses.started, position: 4096, updatedAt },
			{ version: 2 },
		);
		await move({ ticket: y, status: "in-progress", after: column[0] });
		const row = (await ticketRow(h.db, y))!;
		expect(row.version).toBe(3);
		expect(at(row.updated_at)).toBe(updatedAt.getTime());
		const rows = await activityRows(h.db, y);
		expect(rows).toHaveLength(1);
		expect(rows[0]!.field).toBe("position");
	});

	test("a move across columns writes the status row and the position row in one batch", async () => {
		const updatedAt = hoursAgo(1);
		const { column, x } = await seed([1024, 2048, 3072], { updatedAt });
		await move({ ticket: x, status: "in-progress", after: column[0] });
		const rows = await activityRows(h.db, x);
		expect(rows.map((row) => row.field).sort()).toEqual(["position", "status"]);
		expect(rows[0]!.batch_id).toBe(rows[1]!.batch_id);
		expect(at((await ticketRow(h.db, x))!.updated_at)).toBeGreaterThan(updatedAt.getTime());
	});

	test("a move sets started_at and completed_at by category", async () => {
		const { x } = await seed();
		const before = Date.now();
		await move({ ticket: x, status: "in-progress" });
		await move({ ticket: x, status: "done" });
		const row = (await ticketRow(h.db, x))!;
		expect(at(row.started_at)).toBeGreaterThanOrEqual(before);
		expect(at(row.completed_at)).toBeGreaterThanOrEqual(at(row.started_at));
	});

	test("a move with a stale expectedVersion throws VERSION_CONFLICT", async () => {
		const { statuses, x } = await seed([1024, 2048, 3072], {}, { version: 3 });
		const data = await expectError(move({ ticket: x, status: "in-progress", expectedVersion: 2 }), "VERSION_CONFLICT");
		expect(data.current).toMatchObject({ id: x, version: 3 });
		expect((await ticketRow(h.db, x))!).toMatchObject({ status_id: statuses.todo, position: 1024, version: 3 });
	});

	test("a move in an archived project throws PROJECT_ARCHIVED", async () => {
		await seedActors(h.db);
		const rootId = await seedRoot(h.db, "ARC", { archived_at: new Date() });
		const statuses = await seedStatuses(h.db, rootId);
		const x = await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo });
		await expectError(move({ ticket: x, status: "in-progress" }), "PROJECT_ARCHIVED");
		expect((await ticketRow(h.db, x))!.status_id).toBe(statuses.todo);
	});

	test("a move emits ticket.updated with the new version and position", async () => {
		const { x } = await seed();
		const { events } = await move({ ticket: x, status: "in-progress" });
		expect(events).toHaveLength(1);
		const event = events[0]!;
		expect(event.type).toBe("ticket.updated");
		if (event.type !== "ticket.updated") return;
		expect(event.summary).toMatchObject({ id: x, version: 2, position: 4096 });
	});
});
