import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { seedActivity, seedComment, seedProject, seedTicket } from "../../../test/fixtures";
import { freshDb, type TestDb } from "../../../test/helpers/db.ts";
import { InvalidCursorError } from "./support.ts";
import { timeline } from "./timeline.ts";

let h: TestDb;
beforeAll(async () => {
	h = await freshDb();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

type Input = Parameters<typeof timeline>[1];

const run = (input: Input) => h.db.transaction((tx) => timeline(tx, input));

const base = Date.parse("2026-09-08T10:00:00Z");
const at = (seconds: number) => new Date(base + seconds * 1000);

const tag = (item: { kind: string; id: string | number }) => `${item.kind}:${item.id}`;

const seedOneTicket = async () => {
	const { rootId, statuses } = await seedProject(h.db);
	const ticket = await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo });
	return { rootId, statuses, ticket };
};

describe("timeline", () => {
	test("timeline merges comments and activity newest first", async () => {
		const { rootId, ticket } = await seedOneTicket();
		const rows: Array<{ kind: string; id: string | number; seconds: number }> = [];
		for (const seconds of [1, 4, 6]) {
			rows.push({
				kind: "comment",
				id: await seedComment(h.db, ticket, `c${seconds}`, undefined, at(seconds)),
				seconds,
			});
		}
		for (const seconds of [2, 3, 5, 7]) {
			const id = await seedActivity(h.db, { rootId, projectId: rootId, ticketId: ticket, createdAt: at(seconds) });
			rows.push({ kind: "activity", id, seconds });
		}
		const expected = rows.sort((a, b) => b.seconds - a.seconds).map(tag);
		const { items, nextCursor } = await run({ ticketId: ticket });
		expect(items.map(tag)).toEqual(expected);
		expect(nextCursor).toBeNull();
	});

	test("timeline pages 100 per page through the before cursor", async () => {
		const { rootId, ticket } = await seedOneTicket();
		const all: string[] = [];
		for (let i = 0; i < 130; i++) all.push(`comment:${await seedComment(h.db, ticket, `c${i}`, undefined, at(i))}`);
		for (let i = 0; i < 120; i++) {
			all.push(
				`activity:${await seedActivity(h.db, { rootId, projectId: rootId, ticketId: ticket, createdAt: at(200 + i) })}`,
			);
		}
		const pages: string[][] = [];
		let before: string | undefined;
		do {
			const page = await run({ ticketId: ticket, before });
			pages.push(page.items.map(tag));
			before = page.nextCursor ?? undefined;
		} while (before);
		expect(pages.map((page) => page.length)).toEqual([100, 100, 50]);
		expect(pages.flat().sort()).toEqual([...all].sort());
	});

	test("timeline holds only the requested ticket's rows", async () => {
		const { rootId, statuses, ticket } = await seedOneTicket();
		const other = await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo });
		const mine = `comment:${await seedComment(h.db, ticket, "mine")}`;
		await seedComment(h.db, other, "theirs");
		await seedActivity(h.db, { rootId, projectId: rootId, ticketId: other });
		const { items } = await run({ ticketId: ticket });
		expect(items.map(tag)).toEqual([mine]);
	});

	test("timeline orders equal timestamps deterministically", async () => {
		const { rootId, ticket } = await seedOneTicket();
		const activity = await seedActivity(h.db, { rootId, projectId: rootId, ticketId: ticket, createdAt: at(1) });
		const comment = await seedComment(h.db, ticket, "same second", undefined, at(1));
		const first = (await run({ ticketId: ticket })).items.map(tag);
		const second = (await run({ ticketId: ticket })).items.map(tag);
		expect(first).toEqual([`comment:${comment}`, `activity:${activity}`]);
		expect(second).toEqual(first);
	});

	// `before` is user input. Text that is not a cursor, a cursor of another
	// shape, or a value the column type cannot hold is InvalidCursorError and
	// never a JSON error, a TypeError, or a database error.
	test("a malformed before cursor throws InvalidCursorError", async () => {
		const { ticket } = await seedOneTicket();
		await seedComment(h.db, ticket, "one", undefined, at(1));
		const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
		const rejects = (before: string) =>
			expect(run({ ticketId: ticket, before })).rejects.toBeInstanceOf(InvalidCursorError);
		const iso = "2026-09-08T10:00:02.000Z";
		await rejects("not base64url at all");
		await rejects(Buffer.from("[1").toString("base64url"));
		await rejects(encode(null));
		await rejects(encode({}));
		await rejects(encode({ at: "yesterday", kind: 1, key: "x" }));
		await rejects(encode({ at: "nope", kind: 1, key: "x" }));
		await rejects(encode({ at: iso, kind: "a", key: "x" }));
		await rejects(encode({ at: iso, kind: 2, key: "x" }));
		await rejects(encode({ at: iso, kind: 1, key: 5 }));
		await rejects(encode({ at: iso, kind: 1 }));
		const valid = await run({ ticketId: ticket, before: encode({ at: iso, kind: 1, key: "zz" }) });
		expect(valid.items).toHaveLength(1);
	});
});
