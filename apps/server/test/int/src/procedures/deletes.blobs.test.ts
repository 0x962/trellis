import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { blobPath } from "../../../../src/storage/blobs.ts";
import { createTestApp, type TestApp } from "../../../helpers/app.ts";
import { freshDb, type TestDb } from "../../../helpers/db.ts";
import { sha256Of } from "../../../helpers/home.ts";
import { assertBlobInvariant } from "../../../invariants.ts";

// A ticket delete, a bulk delete, and a forced project delete remove the
// attachment rows of the deleted tickets. The blob file of a hash that no
// row names any more goes after the commit. A file another row still names
// stays.

let h: TestDb;
let t: TestApp;
beforeAll(async () => {
	h = await freshDb();
});
beforeEach(async () => {
	await h.reset();
	t = await createTestApp({ db: h });
	await t.seedProject("CDE");
	for (const title of ["First", "Second", "Third"]) await t.createTicket({ project: "CDE", title });
});
afterEach(() => t.close());
afterAll(() => h.close());

const upload = async (ticket: string, text: string) => {
	const bytes = new TextEncoder().encode(text);
	const form = new FormData();
	form.set("file", new File([bytes], "notes.txt", { type: "text/plain" }));
	const response = await t.api(`/api/tickets/${ticket}/attachments`, { method: "POST", raw: form });
	expect(response.status).toBe(201);
	return blobPath(t.home, sha256Of(bytes));
};

const blobInvariant = () => t.serverTx((tx) => assertBlobInvariant(tx, t.home));

describe("blob removal on delete", () => {
	test("a ticket delete removes the blob that only its attachment named", async () => {
		const only = await upload("CDE-1", "only on CDE-1");
		const shared = await upload("CDE-1", "on CDE-1 and CDE-2");
		await upload("CDE-2", "on CDE-1 and CDE-2");

		await t.client.tickets.delete({ ticket: "CDE-1" });

		expect(existsSync(only)).toBe(false);
		expect(existsSync(shared)).toBe(true);
		await blobInvariant();
	});

	test("a bulk delete removes the blobs of every deleted ticket", async () => {
		const first = await upload("CDE-1", "on CDE-1");
		const second = await upload("CDE-2", "on CDE-2");
		const kept = await upload("CDE-3", "on CDE-3");

		await t.client.tickets.deleteMany({ tickets: ["CDE-1", "CDE-2"] });

		expect(existsSync(first)).toBe(false);
		expect(existsSync(second)).toBe(false);
		expect(existsSync(kept)).toBe(true);
		await blobInvariant();
	});

	test("a forced project delete removes the blobs of its tickets", async () => {
		await t.seedProject("OPS", "Operations");
		await t.createTicket({ project: "OPS", title: "Kept" });
		const gone = await upload("CDE-1", "on CDE-1");
		const kept = await upload("OPS-1", "on OPS-1");

		await t.client.projects.delete({ project: "CDE", force: true });

		expect(existsSync(gone)).toBe(false);
		expect(existsSync(kept)).toBe(true);
		await blobInvariant();
	});
});
