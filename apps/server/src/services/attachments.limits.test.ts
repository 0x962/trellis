import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { count, seedProject, seedTicket } from "../../test/fixtures";
import { testCtx, withEmit } from "../../test/helpers/ctx.ts";
import { freshDb, type TestDb } from "../../test/helpers/db.ts";
import { caught } from "../../test/helpers/errors.ts";
import { freshHomeWithDirs } from "../../test/helpers/home.ts";
import { assertStatusInvariant } from "../../test/invariants.ts";
import { withTx } from "../db/tx.ts";
import { upload } from "./attachments.ts";

// A refused upload leaves nothing behind: no row, no blob, and no file under
// `attachments/tmp`.

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

const blobFiles = () =>
	readdirSync(join(home, "attachments"), { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => entry.name);

const runUpload = (input: { ticket: string; file: File }, maxUploadBytes?: number) => {
	const handle = testCtx({ db: h.db, home, maxUploadBytes });
	return withTx(h.db, (tx, emit) => upload(withEmit(handle.ctx, emit), tx, input));
};

describe("attachments limits", () => {
	test("an upload to an archived project stores nothing", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		await h.db.execute(sql`UPDATE projects SET archived_at = now() WHERE id = ${rootId}`);
		await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo, number: 1 });
		const file = new File([new TextEncoder().encode("pixels")], "shot.png", { type: "image/png" });

		const error = await caught(runUpload({ ticket: "CDE-1", file }));

		expect(error.code).toBe("PROJECT_ARCHIVED");
		expect(await count(h.db, "attachments")).toBe(0);
		expect(blobFiles()).toEqual([]);
		expect(readdirSync(join(home, "attachments", "tmp"))).toEqual([]);
	});

	test("an upload over the size limit stores nothing", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo, number: 1 });
		const file = new File([new Uint8Array(2048).fill(3)], "big.bin", { type: "application/octet-stream" });

		const error = await caught(runUpload({ ticket: "CDE-1", file }, 1024));

		expect(error.code).toBe("PAYLOAD_TOO_LARGE");
		expect(error.data).toEqual({ maxBytes: 1024 });
		expect(await count(h.db, "attachments")).toBe(0);
		expect(blobFiles()).toEqual([]);
		expect(readdirSync(join(home, "attachments", "tmp"))).toEqual([]);
	});
});
