import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { PrioritySchema, SortSchema } from "@trellis/api";
import { hoursAgo, type StatusIds, seedProject, seedTicket } from "../../../test/fixtures";
import { freshDb, type TestDb } from "../../../test/helpers/db.ts";
import { InvalidCursorError, ticketList } from "./ticketList.ts";

let h: TestDb;
beforeAll(async () => {
	h = await freshDb();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

type Input = Parameters<typeof ticketList>[1];

const list = (input: Input) => h.db.transaction((tx) => ticketList(tx, input));

// Many tickets share a priority, a status, and an updated_at, so every sort
// has ties that only the id tiebreak resolves.
const seedMany = async (rootId: string, statuses: StatusIds, total: number) => {
	const statusIds = Object.values(statuses);
	const ids: string[] = [];
	for (let i = 0; i < total; i++) {
		ids.push(
			await seedTicket(h.db, {
				projectId: rootId,
				rootId,
				statusId: statusIds[i % statusIds.length]!,
				priority: PrioritySchema.options[i % 5]!,
				position: (i % 7) * 1024,
				updatedAt: hoursAgo(i % 10),
				createdAt: hoursAgo(100 + (i % 13)),
			}),
		);
	}
	return ids;
};

const decode = (cursor: string) => JSON.parse(Buffer.from(cursor, "base64url").toString()) as Record<string, unknown>;
const encode = (value: Record<string, unknown>) => Buffer.from(JSON.stringify(value)).toString("base64url");

describe("ticketList cursor", () => {
	test("the keyset cursor pages every sort without gaps or overlap", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const all = await seedMany(rootId, statuses, 120);
		for (const sort of SortSchema.options) {
			const unpaged = (await list({ projectIds: [rootId], sort, limit: 200 })).items.map((item) => item.id);
			const pages: string[][] = [];
			let cursor: string | undefined;
			do {
				const page = await list({ projectIds: [rootId], sort, limit: 50, cursor });
				pages.push(page.items.map((item) => item.id));
				cursor = page.nextCursor ?? undefined;
			} while (cursor);
			expect(pages.map((page) => page.length)).toEqual([50, 50, 20]);
			const paged = pages.flat();
			expect(new Set(paged).size).toBe(120);
			expect([...paged].sort()).toEqual([...all].sort());
			expect(paged).toEqual(unpaged);
		}
	});

	test("a cursor from another filter or sort throws InvalidCursorError", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		await seedMany(rootId, statuses, 30);
		const first = await list({ projectIds: [rootId], categories: ["started"], sort: "-updatedAt", limit: 2 });
		const cursor = first.nextCursor!;
		expect(cursor).toBeString();
		expect(Object.keys(decode(cursor)).sort()).toEqual(["h", "k", "v"]);
		const otherFilter = list({ projectIds: [rootId], categories: ["done"], sort: "-updatedAt", limit: 2, cursor });
		await expect(otherFilter).rejects.toBeInstanceOf(InvalidCursorError);
		const otherSort = list({ projectIds: [rootId], categories: ["started"], sort: "position", limit: 2, cursor });
		await expect(otherSort).rejects.toBeInstanceOf(InvalidCursorError);
	});

	test("a cursor with an unknown version throws InvalidCursorError", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		await seedMany(rootId, statuses, 5);
		const first = await list({ projectIds: [rootId], limit: 2 });
		const tampered = encode({ ...decode(first.nextCursor!), v: 999 });
		await expect(list({ projectIds: [rootId], limit: 2, cursor: tampered })).rejects.toBeInstanceOf(InvalidCursorError);
	});

	test("ticketList returns at most limit rows and a cursor when more exist", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		await seedMany(rootId, statuses, 300);
		const page = await list({ projectIds: [rootId], limit: 200 });
		expect(page.items).toHaveLength(200);
		expect(page.nextCursor).toBeString();
		const one = await list({ projectIds: [rootId], limit: 1 });
		expect(one.items).toHaveLength(1);
	});
});
