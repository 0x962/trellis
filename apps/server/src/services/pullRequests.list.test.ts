import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { claude, dana, linkPr, seedPr, seedProject, seedTicket } from "../../test/fixtures";
import { testCtx } from "../../test/helpers/ctx.ts";
import { freshDb, type TestDb } from "../../test/helpers/db.ts";
import { freshHomeWithDirs } from "../../test/helpers/home.ts";
import { assertStatusInvariant } from "../../test/invariants.ts";
import { list } from "./pullRequests.ts";

// The ticket page reads its pull requests newest link first, with how each
// one got there.

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

describe("pullRequests.list", () => {
	test("list returns the linked pull requests of a ticket", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const ticket = await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo, number: 1 });
		const other = await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo, number: 2 });
		const older = await seedPr(h.db, { number: 11, ciState: "pass" });
		const newer = await seedPr(h.db, { number: 12, ciState: "fail", state: "closed" });
		const elsewhere = await seedPr(h.db, { number: 13 });
		await linkPr(h.db, ticket, older, dana, "manual");
		await linkPr(h.db, ticket, newer, claude, "auto");
		await linkPr(h.db, other, elsewhere);
		await h.db.execute(sql`UPDATE ticket_pull_requests SET created_at = ${at(1)} WHERE pull_request_id = ${older}`);
		await h.db.execute(sql`UPDATE ticket_pull_requests SET created_at = ${at(2)} WHERE pull_request_id = ${newer}`);
		const ctx = testCtx({ db: h.db, home }).ctx;

		const items = await h.db.transaction((tx) => list(ctx, tx, { ticket: "CDE-1" }));

		expect(items.map((item) => item.id)).toEqual([newer, older]);
		expect(items[0]).toMatchObject({
			number: 12,
			state: "closed",
			ciState: "fail",
			source: "auto",
			linkedBy: { name: claude.name, kind: claude.kind },
		});
		expect(items[0]!.linkedAt).toBeString();
		expect(items[1]).toMatchObject({ number: 11, source: "manual", linkedBy: { name: dana.name, kind: dana.kind } });
	});
});
