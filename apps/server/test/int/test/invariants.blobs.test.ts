import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { blobPath } from "../../../src/storage/blobs.ts";
import { seedAttachment, seedProject, seedTicket } from "../../fixtures";
import { freshDb, type TestDb } from "../../helpers/db.ts";
import { freshHomeWithDirs, sha256Of } from "../../helpers/home.ts";
import { assertBlobInvariant } from "../../invariants.ts";

// The blob invariant: every attachment row has its blob on disk, and every
// blob on disk has at least one attachment row. A violation names the sha,
// so a failing test says which file is missing or spare.

let h: TestDb;
let home: string;
beforeAll(async () => {
	h = await freshDb();
});
beforeEach(async () => {
	await h.reset();
	home = freshHomeWithDirs();
});
afterAll(() => h.close());

const bytesOf = (text: string) => new TextEncoder().encode(text);

describe("assertBlobInvariant", () => {
	test("the blob invariant reports a row without a blob and a blob without a row", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const ticket = await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo, number: 1 });
		const bytes = bytesOf("the bytes of the row");
		const sha = sha256Of(bytes);
		await seedAttachment(h.db, ticket, { sha256: sha });

		const missing = await h.db.transaction((tx) =>
			assertBlobInvariant(tx, home).then(
				() => null,
				(error) => error,
			),
		);
		expect((missing as Error).message).toContain(sha);

		await Bun.write(blobPath(home, sha), bytes);
		await h.db.transaction((tx) => assertBlobInvariant(tx, home));

		const spare = sha256Of(bytesOf("a blob no row holds"));
		await Bun.write(blobPath(home, spare), bytesOf("a blob no row holds"));
		const extra = await h.db.transaction((tx) =>
			assertBlobInvariant(tx, home).then(
				() => null,
				(error) => error,
			),
		);
		expect((extra as Error).message).toContain(spare);
	});
});
