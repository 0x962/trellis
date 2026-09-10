import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { claude, navid, seedAttachment, seedProject, seedTicket } from "../../test/fixtures";
import { testCtx } from "../../test/helpers/ctx.ts";
import { freshDb, type TestDb } from "../../test/helpers/db.ts";
import { freshHomeWithDirs } from "../../test/helpers/home.ts";
import { assertStatusInvariant } from "../../test/invariants.ts";
import { get, list } from "./attachments.ts";

// The read side answers the metadata of a row plus the url that serves its
// bytes. It never reads the blob.

let h: TestDb;
let home: string;
beforeAll(async () => {
	h = await freshDb();
});
beforeEach(async () => {
	await h.reset();
	home = freshHomeWithDirs();
});
afterEach(() => h.db.transaction(assertStatusInvariant));
afterAll(() => h.close());

const at = (minutes: number) => new Date(Date.parse("2026-09-08T10:00:00Z") + minutes * 60_000);

const seedThree = async () => {
	const { rootId, statuses } = await seedProject(h.db);
	const ticket = await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo, number: 1 });
	const other = await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo, number: 2 });
	const first = await seedAttachment(h.db, ticket, { filename: "one.txt", created_at: at(1), sha256: "1".repeat(64) });
	const second = await seedAttachment(
		h.db,
		ticket,
		{ filename: "two.png", mime: "image/png", created_at: at(2), sha256: "2".repeat(64) },
		claude,
	);
	const third = await seedAttachment(h.db, ticket, {
		filename: "three.pdf",
		created_at: at(3),
		sha256: "3".repeat(64),
	});
	await seedAttachment(h.db, other, { filename: "elsewhere.txt", created_at: at(4), sha256: "4".repeat(64) });
	return { ticket, first, second, third };
};

describe("attachments read", () => {
	test("list returns the attachments of a ticket newest first", async () => {
		const { ticket, first, second, third } = await seedThree();
		const handle = testCtx({ db: h.db, home });

		const items = await h.db.transaction((tx) => list(handle.ctx, tx, { ticket: "CDE-1" }));

		expect(items.map((item) => item.id)).toEqual([third, second, first]);
		expect(items.map((item) => item.url)).toEqual([
			`/api/attachments/${third}/file`,
			`/api/attachments/${second}/file`,
			`/api/attachments/${first}/file`,
		]);
		expect(items[1]).toMatchObject({
			ticketId: ticket,
			filename: "two.png",
			mime: "image/png",
			actor: { name: claude.name, kind: claude.kind },
		});
		expect(items[0]!.actor).toEqual({ name: navid.name, kind: navid.kind });
	});

	test("get returns one attachment with its url", async () => {
		const { ticket, second } = await seedThree();
		const handle = testCtx({ db: h.db, home });

		const item = await h.db.transaction((tx) => get(handle.ctx, tx, { id: second }));

		expect(item).toMatchObject({
			id: second,
			ticketId: ticket,
			filename: "two.png",
			mime: "image/png",
			sha256: "2".repeat(64),
			url: `/api/attachments/${second}/file`,
			actor: { name: claude.name, kind: claude.kind },
		});
	});
});
