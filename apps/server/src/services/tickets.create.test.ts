import { describe, expect, test } from "bun:test";
import { ulidPattern } from "@trellis/api";
import { sql } from "drizzle-orm";
import {
	count,
	navid,
	seedActors,
	seedChild,
	seedProject,
	seedRoot,
	seedRootWithStatuses,
	seedStatuses,
	seedTicket,
} from "../../test/fixtures";
import { activityOf, expectErrorData, millis, query, ticketHarness, ticketRow } from "../../test/helpers/services.ts";
import * as tickets from "./tickets.ts";

const h = ticketHarness();

const create = (input: Record<string, unknown>) =>
	h.as(navid)((ctx, tx) => tickets.create(ctx, tx, { project: "CDE", title: "Alpha", ...input }));

const counterOf = async (projectId: string) =>
	(await query<{ ticket_counter: number }>(h.db, sql`SELECT ticket_counter FROM projects WHERE id = ${projectId}`))[0]!
		.ticket_counter;

describe("tickets.create", () => {
	test("create fills the defaults from the project and numbers the first ticket KEY-1", async () => {
		await seedActors(h.db);
		const rootId = await seedRoot(h.db, "CDE", { ticket_template: "## Goal\n\n## Done when" });
		const statuses = await seedStatuses(h.db, rootId);
		const { result: ticket } = await create({});
		expect(ticket).toMatchObject({
			number: 1,
			identifier: "CDE-1",
			version: 1,
			priority: "none",
			description: "## Goal\n\n## Done when",
			position: 1024,
		});
		expect(ticket.status.id).toBe(statuses.todo);
	});

	test("create puts the ticket last in the column at max position plus 1024", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		for (const position of [1024, 2048, 3072]) {
			await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo, position });
		}
		const { result: ticket } = await create({});
		expect(ticket.position).toBe(4096);
		const column = await query<{ id: string }>(
			h.db,
			sql`SELECT id FROM tickets WHERE status_id = ${statuses.todo} ORDER BY position, id`,
		);
		expect(column.at(-1)?.id).toBe(ticket.id);
	});

	test("50 concurrent creates yield consecutive numbers", async () => {
		const { rootId } = await seedProject(h.db);
		const runs = Array.from({ length: 50 }, (_, i) => create({ title: `Ticket ${i}` }));
		const created = await Promise.all(runs);
		const numbers = created.map((run) => run.result.number).sort((a, b) => a - b);
		expect(numbers).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
		expect(await counterOf(rootId)).toBe(50);
	});

	test("a ticket in a sub-project takes the root counter and the root key", async () => {
		const { rootId } = await seedProject(h.db);
		const webId = await seedChild(h.db, rootId, rootId, "web");
		const { result: ticket } = await create({ project: "CDE.web" });
		expect(ticket).toMatchObject({ number: 1, identifier: "CDE-1" });
		expect(ticket.project.id).toBe(webId);
		expect(await counterOf(rootId)).toBe(1);
		expect(await counterOf(webId)).toBe(0);
	});

	test("create accepts a status ref from the effective set", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		await seedChild(h.db, rootId, rootId, "web");
		const { result: ticket } = await create({ project: "CDE.web", status: "in-progress" });
		expect(ticket.status.id).toBe(statuses.started);
	});

	test("create rejects a status outside the project with STATUS_NOT_IN_PROJECT", async () => {
		const { statuses } = await seedProject(h.db);
		const ops = await seedRootWithStatuses(h.db, "OPS");
		const data = await expectErrorData(create({ status: ops.statuses.started }), "STATUS_NOT_IN_PROJECT");
		expect(data.valid.map((status) => status.id)).toEqual(Object.values(statuses));
		expect(await count(h.db, "tickets")).toBe(0);
	});

	test("create links the ticket to a parent in the same root", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const parentId = await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo, number: 7 });
		const { result: ticket } = await create({ parent: "CDE-7" });
		expect(ticket.parent).toEqual({ id: parentId, identifier: "CDE-7" });
		expect((await ticketRow(h.db, ticket.id))?.parent_id).toBe(parentId);
		const { result: parent } = await h.as(navid)((ctx, tx) => tickets.get(ctx, tx, { ticket: parentId }));
		expect(parent.childCount).toBe(1);
	});

	test("create rejects a parent in another root with CROSS_ROOT_MOVE", async () => {
		await seedProject(h.db);
		const ops = await seedRootWithStatuses(h.db, "OPS");
		const parentId = await seedTicket(h.db, {
			projectId: ops.rootId,
			rootId: ops.rootId,
			statusId: ops.statuses.todo,
		});
		await expectErrorData(create({ parent: parentId }), "CROSS_ROOT_MOVE");
		expect(await count(h.db, "tickets")).toBe(1);
	});

	test("create on an archived project throws PROJECT_ARCHIVED", async () => {
		await seedActors(h.db);
		const rootId = await seedRoot(h.db, "ARC", { archived_at: new Date() });
		await seedStatuses(h.db, rootId);
		await expectErrorData(create({ project: "ARC" }), "PROJECT_ARCHIVED");
		expect(await count(h.db, "tickets")).toBe(0);
	});

	test("create with an unknown project ref throws NOT_FOUND", async () => {
		await seedProject(h.db);
		const data = await expectErrorData(create({ project: "NOPE" }), "NOT_FOUND");
		expect(data).toEqual({ kind: "project", ref: "NOPE" });
	});

	test("create into a started status sets started_at", async () => {
		await seedProject(h.db);
		const before = Date.now();
		const { result: ticket } = await create({ status: "in-progress" });
		const row = (await ticketRow(h.db, ticket.id))!;
		expect(millis(row.started_at)).toBeGreaterThanOrEqual(before);
		expect(millis(row.started_at)).toBeLessThanOrEqual(Date.now());
		expect(row.completed_at).toBeNull();
	});

	test("create into a done status sets completed_at", async () => {
		await seedProject(h.db);
		const before = Date.now();
		const { result: ticket } = await create({ status: "done" });
		const row = (await ticketRow(h.db, ticket.id))!;
		expect(millis(row.completed_at)).toBeGreaterThanOrEqual(before);
		expect(ticket.completedAt).toBe(new Date(row.completed_at as string).toISOString());
	});

	test("create writes one ticket.created activity row with a batch id", async () => {
		const { rootId } = await seedProject(h.db);
		const { result: ticket } = await create({});
		const rows = await activityOf(h.db);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			action: "ticket.created",
			actor_name: "navid",
			actor_kind: "human",
			root_id: rootId,
			project_id: rootId,
			ticket_id: ticket.id,
		});
		expect(rows[0]!.batch_id).toMatch(ulidPattern);
	});

	test("create emits ticket.created with the summary and version 1", async () => {
		await seedProject(h.db);
		const { result: ticket, events } = await create({});
		const [row] = await activityOf(h.db);
		expect(events).toHaveLength(1);
		const event = events[0]!;
		expect(event.type).toBe("ticket.created");
		if (event.type !== "ticket.created") return;
		expect(event.summary).toMatchObject({ id: ticket.id, identifier: "CDE-1", version: 1 });
		expect(event.fields).toContain("title");
		expect(event.batchId).toBe(row!.batch_id);
	});
});
