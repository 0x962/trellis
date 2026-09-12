import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { PrioritySchema, SortSchema } from "@trellis/api";
import { hoursAgo, type StatusIds, seedProject, seedTicket } from "../../../../fixtures";
import { freshDb, type TestDb } from "../../../../helpers/db.ts";
import { InvalidCursorError, ticketList } from "../../../../../src/db/queries/ticketList.ts";

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

	// A cursor is user input: JSON that is not the cursor object, or a sort
	// value of the wrong type, is InvalidCursorError and never a database error.
	test("a malformed cursor throws InvalidCursorError", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		await seedMany(rootId, statuses, 5);
		const rejects = async (sort: Input["sort"], cursor: string) =>
			expect(list({ projectIds: [rootId], sort, limit: 2, cursor })).rejects.toBeInstanceOf(InvalidCursorError);
		await rejects("-updatedAt", encode({ v: 1 }));
		await rejects("-updatedAt", Buffer.from("null").toString("base64url"));
		await rejects("-updatedAt", Buffer.from("[1").toString("base64url"));
		await rejects("-updatedAt", "not base64url at all");
		const tamper = async (sort: Input["sort"], k: unknown[]) => {
			const cursor = decode((await list({ projectIds: [rootId], sort, limit: 2 })).nextCursor!);
			await rejects(sort, encode({ ...cursor, k }));
		};
		const first = decode((await list({ projectIds: [rootId], sort: "number", limit: 2 })).nextCursor!);
		const id = (first.k as unknown[])[1];
		await tamper("number", ["not-a-number", id]);
		await tamper("number", [1.5, id]);
		await tamper("-updatedAt", ["yesterday", id]);
		await tamper("-updatedAt", [Date.now(), id]);
		await tamper("position", ["1024", id]);
		await tamper("status", [1, "2", id]);
		await tamper("priority", [1, 7]);
		await tamper("priority", [1]);
	});

	// A sort value of the right JavaScript type can still fall outside the
	// Postgres column type: an integer past int4, a year Postgres has no
	// calendar for, a day that does not exist. Each is InvalidCursorError.
	test("a cursor value outside the column type throws InvalidCursorError", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		await seedMany(rootId, statuses, 5);
		const tamper = async (sort: Input["sort"], k: unknown[]) => {
			const cursor = decode((await list({ projectIds: [rootId], sort, limit: 2 })).nextCursor!);
			await expect(
				list({ projectIds: [rootId], sort, limit: 2, cursor: encode({ ...cursor, k }) }),
			).rejects.toBeInstanceOf(InvalidCursorError);
		};
		const first = decode((await list({ projectIds: [rootId], sort: "number", limit: 2 })).nextCursor!);
		const id = (first.k as unknown[])[1];
		await tamper("number", [2 ** 31, id]);
		await tamper("number", [2 ** 40, id]);
		await tamper("number", [-(2 ** 31) - 1, id]);
		await tamper("status", [2 ** 40, 1, id]);
		await tamper("-updatedAt", ["+275760-09-13T00:00:00.000Z", id]);
		await tamper("-updatedAt", ["0000-01-01T00:00:00.000Z", id]);
		await tamper("-updatedAt", ["2026-02-30T00:00:00.000Z", id]);
		await tamper("-updatedAt", ["2026-09-08T10:00:00Z", id]);
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
