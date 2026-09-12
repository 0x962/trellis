import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { dirname } from "node:path";
import { sql } from "drizzle-orm";
import { withTx } from "../../../../src/db/tx.ts";
import { remove, upload } from "../../../../src/services/attachments.ts";
import { blobPath } from "../../../../src/storage/blobs.ts";
import { seedProject, seedTicket } from "../../../fixtures";
import { testCtx, withEmit } from "../../../helpers/ctx.ts";
import { freshDb, type TestDb } from "../../../helpers/db.ts";
import { freshHomeWithDirs, sha256Of } from "../../../helpers/home.ts";
import { assertStatusInvariant } from "../../../invariants.ts";

// One blob serves every row with its sha256. A delete unlinks the blob only
// when the row it removed was the last one on that sha.

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

const rows = async (table: string) =>
	(await h.db.execute(sql`SELECT * FROM ${sql.identifier(table)}`)).rows as Record<string, unknown>[];

const seedTwoTickets = async () => {
	const { rootId, statuses } = await seedProject(h.db);
	const first = await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo, number: 1 });
	const second = await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo, number: 2 });
	return { rootId, first, second };
};

const text = "the same bytes on two tickets";
const bytes = new TextEncoder().encode(text);
const file = () => new File([bytes], "notes.txt", { type: "text/plain" });

const runUpload = async (ticket: string) => {
	const handle = testCtx({ db: h.db, home });
	const { result } = await withTx(h.db, (tx, emit) => upload(withEmit(handle.ctx, emit), tx, { ticket, file: file() }));
	await handle.runAfterCommit();
	return result;
};

describe("attachments dedupe", () => {
	test("two uploads of one file share a blob and keep two rows", async () => {
		await seedTwoTickets();
		const sha = sha256Of(bytes);

		const first = await runUpload("CDE-1");
		const second = await runUpload("CDE-2");

		expect(readdirSync(dirname(blobPath(home, sha)))).toEqual([sha]);
		const stored = await rows("attachments");
		expect(stored).toHaveLength(2);
		expect(stored.map((row) => row.sha256)).toEqual([sha, sha]);
		expect(first.attachment.sha256).toBe(sha);
		expect(second.attachment.sha256).toBe(sha);
		expect(await Bun.file(blobPath(home, first.attachment.sha256)).text()).toBe(text);
		expect(await Bun.file(blobPath(home, second.attachment.sha256)).text()).toBe(text);
	});

	test("a delete keeps the blob while a second row holds the sha", async () => {
		await seedTwoTickets();
		const sha = sha256Of(bytes);
		const first = await runUpload("CDE-1");
		await runUpload("CDE-2");

		const handle = testCtx({ db: h.db, home });
		await withTx(h.db, (tx, emit) => remove(withEmit(handle.ctx, emit), tx, { id: first.attachment.id }));
		await handle.runAfterCommit();

		expect(await rows("attachments")).toHaveLength(1);
		expect(existsSync(blobPath(home, sha))).toBe(true);
	});
});
