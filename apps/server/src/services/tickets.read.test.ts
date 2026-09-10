import { describe, expect, test } from "bun:test";
import { BoardQuerySchema, ListQuerySchema } from "@trellis/api";
import {
	hoursAgo,
	linkPr,
	navid,
	seedAttachment,
	seedChild,
	seedComment,
	seedPr,
	seedProject,
	seedStatus,
	seedTicket,
} from "../../test/fixtures";
import { expectErrorData, ticketHarness } from "../../test/helpers/services.ts";
import * as tickets from "./tickets.ts";

const h = ticketHarness();

const list = (input: Record<string, unknown>) =>
	h.as(navid)((ctx, tx) => tickets.list(ctx, tx, ListQuerySchema.parse(input)));

// A root with its six statuses, a sub-project `web`, two tickets in the root
// and two in `web`, every ticket in Todo with a distinct updated_at.
const seedTree = async () => {
	const { rootId, statuses } = await seedProject(h.db);
	const webId = await seedChild(h.db, rootId, rootId, "web");
	const seed = (projectId: string, hours: number) =>
		seedTicket(h.db, { projectId, rootId, statusId: statuses.todo, updatedAt: hoursAgo(hours) });
	const root = [await seed(rootId, 4), await seed(rootId, 2)];
	const web = [await seed(webId, 3), await seed(webId, 1)];
	return { rootId, statuses, webId, root, web };
};

describe("tickets.list status refs", () => {
	test("a status ref outside the project's statuses throws STATUS_NOT_IN_PROJECT", async () => {
		await seedTree();

		const data = await expectErrorData(list({ project: "CDE", status: "in-progres" }), "STATUS_NOT_IN_PROJECT");

		expect(data.valid.map((status) => status.slug)).toContain("in-progress");
	});

	test("a status ref of another project's set throws STATUS_NOT_IN_PROJECT", async () => {
		await seedTree();
		const other = await seedProject(h.db, "OPS");
		await seedStatus(h.db, { projectId: other.rootId, name: "Shipped", category: "done", position: 6 });

		await expectErrorData(list({ project: "CDE", status: "shipped" }), "STATUS_NOT_IN_PROJECT");
	});

	test("a status ref that names no status anywhere throws INPUT_VALIDATION_FAILED", async () => {
		await seedTree();

		const data = await expectErrorData(list({ status: "nosuch" }), "INPUT_VALIDATION_FAILED");

		expect(data.issues[0]!.path).toEqual(["status"]);
	});

	test("a known status ref still narrows the list with and without a project", async () => {
		const { root, web } = await seedTree();

		const { result: scoped } = await list({ project: "CDE", status: "todo" });
		const { result: everywhere } = await list({ status: "todo,category:done" });

		expect(scoped.items).toHaveLength(root.length + web.length);
		expect(everywhere.items).toHaveLength(root.length + web.length);
	});
});

describe("tickets.list", () => {
	test("list resolves the project ref to the subtree", async () => {
		const { root, web } = await seedTree();
		const { result: page } = await list({ project: "CDE", limit: 3 });
		expect(page.items.map((item) => item.id)).toEqual([web[1]!, root[1]!, web[0]!]);
		expect(typeof page.nextCursor).toBe("string");
	});

	test("list with subprojects false narrows to one project", async () => {
		const { root } = await seedTree();
		const { result: page } = await list({ project: "CDE", subprojects: false });
		expect(page.items.map((item) => item.id)).toEqual([root[1]!, root[0]!]);
		expect(page.nextCursor).toBeNull();
	});

	test("list resolves status refs before the query runs", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const seed = (statusId: string) => seedTicket(h.db, { projectId: rootId, rootId, statusId });
		await seed(statuses.todo);
		const started = [await seed(statuses.started), await seed(statuses.started)];
		await seed(statuses.agentReview);
		const { result: page } = await list({ project: "CDE", status: "in-progress,agent-review", category: "started" });
		expect(page.items.map((item) => item.id).sort()).toEqual([...started].sort());
	});

	test("list with a foreign cursor throws INVALID_CURSOR", async () => {
		await seedTree();
		const { result: first } = await list({ project: "CDE", limit: 1 });
		const cursor = first.nextCursor as string;
		await expectErrorData(list({ project: "CDE", priority: "high", limit: 1, cursor }), "INVALID_CURSOR");
	});
});

describe("tickets.board and tickets.counts", () => {
	// A fixed base time, so a seeded update time never depends on the clock.
	const START = Date.parse("2026-01-01T00:00:00.000Z");

	// Two tickets in Todo, two in In Progress, one in Done, none elsewhere.
	// Todo takes its newer ticket last and In Progress takes its newer
	// ticket first, so the column order follows the update time and not the
	// insert order.
	const seedSpread = async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const seed = (statusId: string, minutes: number) =>
			seedTicket(h.db, { projectId: rootId, rootId, statusId, updatedAt: new Date(START + minutes * 60_000) });
		const todo = [await seed(statuses.todo, 1), await seed(statuses.todo, 2)];
		const started = [await seed(statuses.started, 2), await seed(statuses.started, 1)];
		const done = [await seed(statuses.done, 1)];
		return { rootId, statuses, todo, started, done };
	};

	test("board returns one column per effective status in order", async () => {
		const { statuses, todo, started, done } = await seedSpread();
		const { result: board } = await h.as(navid)((ctx, tx) =>
			tickets.board(ctx, tx, BoardQuerySchema.parse({ project: "CDE" })),
		);
		expect(board.columns.map((column) => column.statusId)).toEqual(Object.values(statuses));
		expect(board.columns.map((column) => column.count)).toEqual([2, 2, 0, 0, 1, 0]);
		expect(board.columns[0]!.items.map((item) => item.id)).toEqual([todo[1]!, todo[0]!]);
		expect(board.columns[1]!.items.map((item) => item.id)).toEqual(started);
		expect(board.columns[4]!.items.map((item) => item.id)).toEqual(done);
	});

	test("counts reports the total and every status", async () => {
		const { statuses } = await seedSpread();
		const { result: counts } = await h.as(navid)((ctx, tx) =>
			tickets.counts(ctx, tx, BoardQuerySchema.parse({ project: "CDE" })),
		);
		expect(counts.total).toBe(5);
		expect(counts.byStatus).toEqual([
			{ statusId: statuses.todo, count: 2 },
			{ statusId: statuses.started, count: 2 },
			{ statusId: statuses.agentReview, count: 0 },
			{ statusId: statuses.humanReview, count: 0 },
			{ statusId: statuses.done, count: 1 },
			{ statusId: statuses.canceled, count: 0 },
		]);
	});
});

describe("tickets.get", () => {
	test("get returns the full ticket with its children and links", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const base = { projectId: rootId, rootId, statusId: statuses.todo };
		const id = await seedTicket(h.db, { ...base, number: 9, description: "## Goal\n\nShip it." }, { version: 3 });
		const children = [
			await seedTicket(h.db, { ...base, parentId: id }),
			await seedTicket(h.db, { ...base, parentId: id }),
		];
		const prId = await seedPr(h.db, { number: 12, ciState: "fail" });
		await linkPr(h.db, id, prId);
		const attachmentId = await seedAttachment(h.db, id);
		for (const body of ["a", "b", "c"]) await seedComment(h.db, id, body);
		const { result: ticket } = await h.as(navid)((ctx, tx) => tickets.get(ctx, tx, { ticket: "CDE-9" }));
		expect(ticket).toMatchObject({
			id,
			identifier: "CDE-9",
			description: "## Goal\n\nShip it.",
			commentCount: 3,
			version: 3,
		});
		expect(ticket.children.map((child) => child.id).sort()).toEqual([...children].sort());
		expect(ticket.prs.map((pr) => pr.id)).toEqual([prId]);
		expect(ticket.attachments.map((attachment) => attachment.id)).toEqual([attachmentId]);
	});

	test("get with an unknown ref throws NOT_FOUND", async () => {
		await seedProject(h.db);
		const data = await expectErrorData(
			h.as(navid)((ctx, tx) => tickets.get(ctx, tx, { ticket: "CDE-999" })),
			"NOT_FOUND",
		);
		expect(data).toEqual({ kind: "ticket", ref: "CDE-999" });
	});
});
