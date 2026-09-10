import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { TicketSchema, TicketSummarySchema } from "@trellis/api";
import { seedTicket } from "../../test/fixtures";
import { createTestApp, statusIds, type TestApp } from "../../test/helpers/app.ts";
import { freshDb, type TestDb } from "../../test/helpers/db.ts";

// The ticket reads over /api: the list with its comma grammar, its cursor,
// and its limit; the counts; the board; and the full ticket.

let h: TestDb;
let t: TestApp;
beforeAll(async () => {
	h = await freshDb();
});
beforeEach(async () => {
	await h.reset();
	t = await createTestApp({ db: h });
});
afterAll(() => h.close());

const identifiers = (items: Array<{ identifier: string }>) => items.map((item) => item.identifier);

// Four tickets: two top-level in progress (one with a failing PR), one
// child in agent review, one done.
const seedFour = async () => {
	const project = await t.seedProject("CDE");
	const a = await t.createTicket({ project: "CDE", title: "Dark mode", status: "in-progress" });
	const b = await t.createTicket({ project: "CDE", title: "Login", status: "in-progress" });
	await t.createTicket({ project: "CDE", title: "Child", status: "agent-review", parent: "CDE-1" });
	await t.createTicket({ project: "CDE", title: "Shipped", status: "done" });
	return { project, a, b };
};

describe("tickets.list", () => {
	test("tickets.list returns items and a cursor without a total", async () => {
		await seedFour();

		const response = await t.api("/api/tickets");

		expect(response.status).toBe(200);
		expect(Object.keys(response.body).sort()).toEqual(["items", "nextCursor"]);
		expect(response.body.items).toHaveLength(4);
		for (const item of response.body.items) expect(() => TicketSummarySchema.parse(item)).not.toThrow();
		expect(response.body.items[0]).not.toHaveProperty("description");
	});

	test("tickets.list parses the comma grammar from the query string", async () => {
		await seedFour();

		const response = await t.api(
			"/api/tickets?project=CDE&status=in-progress,agent-review&parent=none&ci=fail&sort=-updatedAt",
		);

		expect(response.status).toBe(200);
		expect(response.body.items).toEqual([]);
		const noCi = await t.api("/api/tickets?project=CDE&status=in-progress,agent-review&parent=none&sort=-updatedAt");
		expect(identifiers(noCi.body.items).sort()).toEqual(["CDE-1", "CDE-2"]);
		const withChildren = await t.api("/api/tickets?project=CDE&status=in-progress,agent-review&sort=number");
		expect(identifiers(withChildren.body.items)).toEqual(["CDE-1", "CDE-2", "CDE-3"]);
	});

	test("tickets.list bounds the limit to 1 through 200", async () => {
		await seedFour();

		const zero = await t.api("/api/tickets?limit=0");
		const over = await t.api("/api/tickets?limit=201");
		const max = await t.api("/api/tickets?limit=200");

		expect([zero.status, zero.body.code]).toEqual([400, "INPUT_VALIDATION_FAILED"]);
		expect([over.status, over.body.code]).toEqual([400, "INPUT_VALIDATION_FAILED"]);
		expect(max.status).toBe(200);
	});

	test("a cursor from another filter answers INVALID_CURSOR", async () => {
		await seedFour();
		const first = await t.api("/api/tickets?status=in-progress&limit=1");
		expect(first.body.nextCursor).toMatch(/\S+/);

		const response = await t.api(
			`/api/tickets?status=done&limit=1&cursor=${encodeURIComponent(first.body.nextCursor)}`,
		);

		expect(response.status).toBe(400);
		expect(response.body.code).toBe("INVALID_CURSOR");
	});
});

describe("tickets.counts and tickets.board", () => {
	test("tickets.counts returns the total and the per-status counts", async () => {
		const { project } = await seedFour();
		const ids = statusIds(project);

		const response = await t.api("/api/tickets/counts?project=CDE&status=in-progress,agent-review");

		expect(response.status).toBe(200);
		expect(Object.keys(response.body).sort()).toEqual(["byStatus", "total"]);
		const list = await t.api("/api/tickets?project=CDE&status=in-progress,agent-review");
		expect(response.body.total).toBe(list.body.items.length);
		expect(response.body.byStatus).toEqual(
			expect.arrayContaining([
				{ statusId: ids.started, count: 2 },
				{ statusId: ids.agentReview, count: 1 },
			]),
		);
	});

	test("tickets.board caps a column at 100 items and reports the full count", async () => {
		const project = await t.seedProject("CDE");
		const ids = statusIds(project);
		for (let n = 1; n <= 150; n += 1) {
			await seedTicket(h.db, { projectId: project.id, rootId: project.id, statusId: ids.todo, number: n });
		}

		const response = await t.api("/api/tickets/board?project=CDE");

		expect(response.status).toBe(200);
		expect(Object.keys(response.body)).toEqual(["columns"]);
		const todo = response.body.columns.find((column: { statusId: string }) => column.statusId === ids.todo);
		expect(todo.count).toBe(150);
		expect(todo.items).toHaveLength(100);
		expect(identifiers(todo.items)).toEqual(Array.from({ length: 100 }, (_, i) => `CDE-${i + 1}`));
		expect(response.body.columns.map((column: { statusId: string }) => column.statusId)).toEqual(Object.values(ids));
	});
});

describe("tickets.get", () => {
	test("tickets.get resolves a case-insensitive identifier and a ULID", async () => {
		const project = await t.seedProject("CDE");
		const ids = statusIds(project);
		for (let n = 1; n <= 41; n += 1) {
			await seedTicket(h.db, { projectId: project.id, rootId: project.id, statusId: ids.todo, number: n });
		}
		const ulid = await seedTicket(h.db, { projectId: project.id, rootId: project.id, statusId: ids.todo, number: 42 });

		const byIdentifier = await t.api("/api/tickets/cde-42");
		const byUlid = await t.api(`/api/tickets/${ulid}`);

		expect(byIdentifier.status).toBe(200);
		expect(byUlid.body).toEqual(byIdentifier.body);
		expect(() => TicketSchema.parse(byIdentifier.body)).not.toThrow();
		expect(byIdentifier.body.identifier).toBe("CDE-42");
		for (const key of ["project", "status", "parent", "children", "prs", "attachments", "commentCount", "version"]) {
			expect(byIdentifier.body).toHaveProperty(key);
		}
	});
});
