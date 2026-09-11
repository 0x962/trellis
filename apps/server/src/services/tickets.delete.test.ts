import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import {
	count,
	dana,
	linkPr,
	seedActivity,
	seedActors,
	seedAttachment,
	seedComment,
	seedPr,
	seedProject,
	seedRoot,
	seedStatuses,
	seedTicket,
} from "../../test/fixtures";
import { expectErrorData, query, ticketHarness, ticketRow, traceRows } from "../../test/helpers/services.ts";
import * as tickets from "./tickets.ts";

const h = ticketHarness();

const remove = (input: Record<string, unknown>) => h.as(dana)((ctx, tx) => tickets.delete(ctx, tx, input));

describe("tickets.delete", () => {
	test("delete detaches the children first and cascades the rest", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const base = { projectId: rootId, rootId, statusId: statuses.todo };
		const parent = await seedTicket(h.db, base);
		const children = [
			await seedTicket(h.db, { ...base, parentId: parent }),
			await seedTicket(h.db, { ...base, parentId: parent }),
		];
		await seedComment(h.db, parent, "one");
		await seedComment(h.db, parent, "two");
		await seedAttachment(h.db, parent);
		await linkPr(h.db, parent, await seedPr(h.db, { number: 1 }));
		await seedActivity(h.db, { rootId, projectId: rootId, ticketId: parent, field: "title" });
		await remove({ ticket: parent });
		expect(await ticketRow(h.db, parent)).toBeUndefined();
		for (const child of children) expect((await ticketRow(h.db, child))!.parent_id).toBeNull();
		expect(await count(h.db, "comments")).toBe(0);
		expect(await count(h.db, "attachments")).toBe(0);
		expect(await count(h.db, "ticket_pull_requests")).toBe(0);
		const owned = await query<{ n: number }>(
			h.db,
			sql`SELECT count(*)::int AS n FROM activity WHERE ticket_id = ${parent}`,
		);
		expect(owned[0]!.n).toBe(0);
	});

	test("delete leaves the project-level trace row with the identifier and title", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const id = await seedTicket(h.db, {
			projectId: rootId,
			rootId,
			statusId: statuses.todo,
			number: 42,
			title: "Fix login",
		});
		await remove({ ticket: id });
		const traces = await traceRows(h.db);
		expect(traces).toHaveLength(1);
		expect(traces[0]).toMatchObject({ action: "ticket.deleted", ticket_id: null, root_id: rootId, project_id: rootId });
		expect(traces[0]!.meta).toMatchObject({ identifier: "CDE-42", title: "Fix login" });
	});

	test("delete emits ticket.deleted with the last summary", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const id = await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo, number: 5, title: "Gone" });
		const { events } = await remove({ ticket: id });
		expect(events).toHaveLength(1);
		const event = events[0]!;
		expect(event.type).toBe("ticket.deleted");
		if (event.type !== "ticket.deleted") return;
		expect(event.summary).toMatchObject({ id, identifier: "CDE-5", title: "Gone" });
	});

	test("a deleted number is never reused", async () => {
		await seedActors(h.db);
		const rootId = await seedRoot(h.db, "CDE", { ticket_counter: 3 });
		const statuses = await seedStatuses(h.db, rootId);
		const id = await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo, number: 3 });
		const { result } = await remove({ ticket: "CDE-3" });
		expect(result).toEqual({ deleted: "CDE-3" });
		expect(await ticketRow(h.db, id)).toBeUndefined();
		const { result: next } = await h.as(dana)((ctx, tx) => tickets.create(ctx, tx, { project: "CDE", title: "Next" }));
		expect(next).toMatchObject({ number: 4, identifier: "CDE-4" });
	});

	test("delete with an unknown ref throws NOT_FOUND", async () => {
		await seedProject(h.db);
		const data = await expectErrorData(remove({ ticket: "CDE-999" }), "NOT_FOUND");
		expect(data).toEqual({ kind: "ticket", ref: "CDE-999" });
	});

	test("delete in an archived project throws PROJECT_ARCHIVED", async () => {
		await seedActors(h.db);
		const rootId = await seedRoot(h.db, "ARC", { archived_at: new Date() });
		const statuses = await seedStatuses(h.db, rootId);
		const id = await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo });
		await expectErrorData(remove({ ticket: id }), "PROJECT_ARCHIVED");
		expect(await ticketRow(h.db, id)).toBeDefined();
	});
});
