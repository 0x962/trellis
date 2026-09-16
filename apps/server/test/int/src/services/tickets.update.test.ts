import { describe, expect, test } from "bun:test";
import * as tickets from "../../../../src/services/tickets.ts";
import {
	claude,
	count,
	dana,
	hoursAgo,
	seedActors,
	seedDefaultBuilder,
	seedProject,
	seedRoot,
	seedRootWithStatuses,
	seedStatus,
	seedStatuses,
	seedTicket,
	type TicketSeed,
} from "../../../fixtures";
import { expectErrorData, millis, ticketHarness, ticketRow } from "../../../helpers/services.ts";

const h = ticketHarness();

const update = (input: Record<string, unknown>) => h.as(dana)((ctx, tx) => tickets.update(ctx, tx, input));

// A root with its six statuses and one ticket in Todo, titled Alpha.
const seed = async (extra: Partial<TicketSeed> = {}, overrides: Record<string, unknown> = {}) => {
	const project = await seedProject(h.db);
	const { rootId, statuses } = project;
	await seedDefaultBuilder(h.db, rootId);
	const id = await seedTicket(
		h.db,
		{ projectId: rootId, rootId, statusId: statuses.todo, title: "Alpha", ...extra },
		overrides,
	);
	return { ...project, id };
};

describe("tickets.update", () => {
	test("update changes the title, bumps the version, and moves updated_at", async () => {
		const { id } = await seed({ updatedAt: hoursAgo(1) });
		const { result: ticket } = await update({ ticket: id, title: "Beta" });
		const row = (await ticketRow(h.db, id))!;
		expect(row.title).toBe("Beta");
		expect(row.version).toBe(2);
		expect(millis(row.updated_at)).toBeGreaterThan(hoursAgo(1).getTime());
		expect(ticket).toMatchObject({ id, title: "Beta", version: 2, updatedAt: new Date(row.updated_at).toISOString() });
	});

	test("update sets started_at on the first move out of todo", async () => {
		const { id } = await seed();
		const before = Date.now();
		await update({ ticket: id, status: "in-progress" });
		const row = (await ticketRow(h.db, id))!;
		expect(millis(row.started_at)).toBeGreaterThanOrEqual(before);
		expect(millis(row.started_at)).toBeLessThanOrEqual(Date.now());
	});

	test("started_at is set once and never overwritten", async () => {
		const yesterday = hoursAgo(24);
		const { rootId, statuses } = await seedProject(h.db);
		await seedDefaultBuilder(h.db, rootId);
		const id = await seedTicket(h.db, {
			projectId: rootId,
			rootId,
			statusId: statuses.started,
			startedAt: yesterday,
		});
		await update({ ticket: id, status: "todo" });
		await update({ ticket: id, status: "in-progress" });
		expect(millis((await ticketRow(h.db, id))!.started_at)).toBe(yesterday.getTime());
	});

	test("completed_at is set on entering done and cleared on leaving", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		await seedDefaultBuilder(h.db, rootId);
		const id = await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.started });
		const before = Date.now();
		await update({ ticket: id, status: "done" });
		expect(millis((await ticketRow(h.db, id))!.completed_at)).toBeGreaterThanOrEqual(before);
		await update({ ticket: id, status: "in-progress" });
		expect((await ticketRow(h.db, id))!.completed_at).toBeNull();
	});

	test("a move into canceled sets completed_at", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		await seedDefaultBuilder(h.db, rootId);
		const id = await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.started });
		const before = Date.now();
		await update({ ticket: id, status: "canceled" });
		expect(millis((await ticketRow(h.db, id))!.completed_at)).toBeGreaterThanOrEqual(before);
	});

	test("update with a matching expectedVersion writes the change", async () => {
		const { id } = await seed({}, { version: 3 });
		const { result: ticket } = await update({ ticket: id, title: "Beta", expectedVersion: 3 });
		expect(ticket.version).toBe(4);
		expect((await ticketRow(h.db, id))!.version).toBe(4);
	});

	test("VERSION_CONFLICT carries the current row and writes nothing", async () => {
		const { id } = await seed({}, { version: 3 });
		const data = await expectErrorData(update({ ticket: id, title: "Beta", expectedVersion: 2 }), "VERSION_CONFLICT");
		expect(data.current).toMatchObject({ id, title: "Alpha", version: 3 });
		expect((await ticketRow(h.db, id))!).toMatchObject({ title: "Alpha", version: 3 });
	});

	test("update rejects a status outside owner(project)", async () => {
		const { id, statuses } = await seed();
		const ops = await seedRootWithStatuses(h.db, "OPS");
		const data = await expectErrorData(update({ ticket: id, status: ops.statuses.started }), "STATUS_NOT_IN_PROJECT");
		expect(data.valid.map((status) => status.id)).toEqual(Object.values(statuses));
		expect((await ticketRow(h.db, id))!.status_id).toBe(statuses.todo);
	});

	test("update rejects a parent that is a descendant with PARENT_CYCLE", async () => {
		const { id: a, rootId, statuses } = await seed();
		const base = { projectId: rootId, rootId, statusId: statuses.todo };
		const b = await seedTicket(h.db, { ...base, parentId: a });
		const c = await seedTicket(h.db, { ...base, parentId: b });
		await expectErrorData(update({ ticket: a, parent: c }), "PARENT_CYCLE");
		expect((await ticketRow(h.db, a))!.parent_id).toBeNull();
	});

	test("update rejects a ticket as its own parent", async () => {
		const { id } = await seed();
		await expectErrorData(update({ ticket: id, parent: id }), "PARENT_CYCLE");
	});

	test("update rejects a parent in another root", async () => {
		const { id } = await seed();
		const ops = await seedRootWithStatuses(h.db, "OPS");
		const other = await seedTicket(h.db, { projectId: ops.rootId, rootId: ops.rootId, statusId: ops.statuses.todo });
		await expectErrorData(update({ ticket: id, parent: other }), "CROSS_ROOT_MOVE");
		expect((await ticketRow(h.db, id))!.parent_id).toBeNull();
	});

	test("update in an archived project throws PROJECT_ARCHIVED", async () => {
		await seedActors(h.db);
		const rootId = await seedRoot(h.db, "ARC", { archived_at: new Date() });
		const statuses = await seedStatuses(h.db, rootId);
		const id = await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo, title: "Alpha" });
		await expectErrorData(update({ ticket: id, title: "Beta" }), "PROJECT_ARCHIVED");
		expect((await ticketRow(h.db, id))!.title).toBe("Alpha");
	});

	test("update with an unknown ticket ref throws NOT_FOUND", async () => {
		await seed();
		const data = await expectErrorData(update({ ticket: "CDE-999", title: "Beta" }), "NOT_FOUND");
		expect(data).toEqual({ kind: "ticket", ref: "CDE-999" });
		expect(await count(h.db, "tickets")).toBe(1);
	});

	test("update emits ticket.updated with the new version and the changed fields", async () => {
		const { id } = await seed({}, { version: 4 });
		const { events } = await update({ ticket: id, title: "Beta", priority: "high" });
		expect(events).toHaveLength(1);
		const event = events[0]!;
		expect(event.type).toBe("ticket.updated");
		if (event.type !== "ticket.updated") return;
		expect(event.summary).toMatchObject({ id, title: "Beta", priority: "high", version: 5 });
		expect([...event.fields].sort()).toEqual(["priority", "title"]);
	});

	test("an agent move into a full status fails with STATUS_FULL", async () => {
		await seedActors(h.db);
		const rootId = await seedRoot(h.db, "WIP");
		await seedDefaultBuilder(h.db, rootId);
		const todo = await seedStatus(h.db, { projectId: rootId, name: "Todo", category: "todo", position: 0 });
		const started = await seedStatus(h.db, {
			projectId: rootId,
			name: "In Progress",
			category: "started",
			position: 1,
			wipLimit: 1,
		});
		await seedTicket(h.db, { projectId: rootId, rootId, statusId: started, title: "Alpha" });
		const id = await seedTicket(h.db, { projectId: rootId, rootId, statusId: todo, title: "Beta" });
		const data = await expectErrorData(
			h.as(claude)((ctx, tx) => tickets.update(ctx, tx, { ticket: id, status: "in-progress" })),
			"STATUS_FULL",
		);
		expect(data).toEqual({ statusId: started, limit: 1, count: 1 });
		expect((await ticketRow(h.db, id))!.status_id).toBe(todo);
	});

	test("a human move into a full status succeeds", async () => {
		await seedActors(h.db);
		const rootId = await seedRoot(h.db, "WIP");
		await seedDefaultBuilder(h.db, rootId);
		const todo = await seedStatus(h.db, { projectId: rootId, name: "Todo", category: "todo", position: 0 });
		const started = await seedStatus(h.db, {
			projectId: rootId,
			name: "In Progress",
			category: "started",
			position: 1,
			wipLimit: 1,
		});
		await seedTicket(h.db, { projectId: rootId, rootId, statusId: started, title: "Alpha" });
		const id = await seedTicket(h.db, { projectId: rootId, rootId, statusId: todo, title: "Beta" });
		await update({ ticket: id, status: "in-progress" });
		expect((await ticketRow(h.db, id))!.status_id).toBe(started);
	});

	test("a move out of a full status always succeeds", async () => {
		await seedActors(h.db);
		const rootId = await seedRoot(h.db, "WIP");
		await seedDefaultBuilder(h.db, rootId);
		await seedStatus(h.db, { projectId: rootId, name: "Todo", category: "todo", position: 0 });
		const started = await seedStatus(h.db, {
			projectId: rootId,
			name: "In Progress",
			category: "started",
			position: 1,
			wipLimit: 1,
		});
		const done = await seedStatus(h.db, { projectId: rootId, name: "Done", category: "done", position: 2 });
		const id = await seedTicket(h.db, { projectId: rootId, rootId, statusId: started, title: "Alpha" });
		await h.as(claude)((ctx, tx) => tickets.update(ctx, tx, { ticket: id, status: "done" }));
		expect((await ticketRow(h.db, id))!.status_id).toBe(done);
	});
});
