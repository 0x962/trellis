import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createTestApp, type TestApp } from "../../test/helpers/app.ts";
import { freshDb, type TestDb } from "../../test/helpers/db.ts";

// GET /api/tickets/{ticket}/timeline merges the comments and the activity of
// one ticket, newest first, 100 per page, with a `before` cursor.

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
afterEach(() => t.close());

type Item = { kind: "comment" | "activity"; id: string | number; createdAt: string };

// One ticket with `count` entries: comments and activity rows in turns,
// with each request complete before the next request starts.
const seedEntries = async (count: number) => {
	await t.seedProject("CDE");
	const ticket = await t.createTicket({ project: "CDE", title: "Busy" });
	for (let i = 0; i < count; i += 1) {
		if (i % 2 === 0) {
			await t.api("/api/tickets/CDE-1/comments", { method: "POST", body: { body: `comment ${i}` } });
		} else await t.api("/api/tickets/CDE-1", { method: "PATCH", body: { title: `title ${i}` } });
	}
	return ticket;
};

const key = (item: Item) => `${item.kind}:${item.id}`;

describe("timeline.list", () => {
	test("timeline.list merges comments and activity newest first", async () => {
		await seedEntries(20);

		const response = await t.api("/api/tickets/CDE-1/timeline?limit=100");

		expect(response.status).toBe(200);
		const items = response.body.items as Item[];
		expect(items.length).toBeGreaterThanOrEqual(20);
		expect(items.length).toBeLessThanOrEqual(100);
		const kinds = new Set(items.map((item) => item.kind));
		expect(kinds).toEqual(new Set(["comment", "activity"]));
		const times = items.map((item) => Date.parse(item.createdAt));
		expect(times).toEqual([...times].sort((a, b) => b - a));
		expect(response.body).toHaveProperty("nextCursor");
	});

	test("timeline.list pages with the before cursor", async () => {
		await seedEntries(150);

		const first = await t.api("/api/tickets/CDE-1/timeline?limit=100");
		expect(first.body.items).toHaveLength(100);
		expect(first.body.nextCursor).toMatch(/\S+/);

		const second = await t.api(`/api/tickets/CDE-1/timeline?before=${encodeURIComponent(first.body.nextCursor)}`);

		expect(second.status).toBe(200);
		const firstKeys = new Set((first.body.items as Item[]).map(key));
		const secondItems = second.body.items as Item[];
		expect(secondItems.length).toBeGreaterThanOrEqual(50);
		for (const item of secondItems) expect(firstKeys.has(key(item)), key(item)).toBe(false);
		const oldestOfFirst = Date.parse((first.body.items as Item[]).at(-1)!.createdAt);
		for (const item of secondItems) expect(Date.parse(item.createdAt)).toBeLessThanOrEqual(oldestOfFirst);
	});
});
