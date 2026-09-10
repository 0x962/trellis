import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createTestApp, type TestApp } from "../../test/helpers/app.ts";
import { freshDb, type TestDb } from "../../test/helpers/db.ts";
import { sha256Of } from "../../test/helpers/home.ts";
import { blobPath } from "../storage/blobs.ts";

// The attachment procedures over /api: a multipart upload that stores the
// blob under its hash, the dedupe of a second upload, and the list, get,
// and delete calls.

let h: TestDb;
let t: TestApp;
beforeAll(async () => {
	h = await freshDb();
});
beforeEach(async () => {
	await h.reset();
	t = await createTestApp({ db: h });
	await t.seedProject("CDE");
	await t.createTicket({ project: "CDE", title: "First" });
	await t.createTicket({ project: "CDE", title: "Second" });
});
afterAll(() => h.close());
afterEach(() => t.close());

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

const upload = (ticket: string, bytes: Uint8Array<ArrayBuffer>, name = "shot.png", type = "image/png") => {
	const form = new FormData();
	form.set("file", new File([bytes], name, { type }));
	return t.api(`/api/tickets/${ticket}/attachments`, { method: "POST", raw: form });
};

const blobFiles = () =>
	readdirSync(join(t.home, "attachments"), { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && entry.name !== "tmp")
		.flatMap((entry) => readdirSync(join(t.home, "attachments", entry.name)));

describe("attachments", () => {
	test("an upload answers 201 and stores the blob under its hash", async () => {
		const sha = sha256Of(PNG);

		const response = await upload("CDE-1", PNG);

		expect(response.status).toBe(201);
		expect(response.headers.get("location")).toBe(`/api/attachments/${response.body.attachment.id}`);
		expect(response.body.attachment).toMatchObject({
			filename: "shot.png",
			mime: "image/png",
			size: PNG.length,
			sha256: sha,
		});
		expect(response.body.url).toBe(`/api/attachments/${response.body.attachment.id}/file`);
		expect(existsSync(blobPath(t.home, sha))).toBe(true);
		expect(blobPath(t.home, sha)).toBe(join(t.home, "attachments", sha.slice(0, 2), sha));
	});

	// A file with no extension arrives from a browser with an empty type. The
	// row needs a mime that the attachment schema accepts, so the answer and
	// every later read of the ticket validate.
	test("an upload with an empty type stores application/octet-stream", async () => {
		const response = await upload("CDE-1", new TextEncoder().encode("plain notes"), "NOTES", "");

		expect(response.status).toBe(201);
		expect(response.body.attachment).toMatchObject({ filename: "NOTES", mime: "application/octet-stream" });
		const list = await t.api("/api/tickets/CDE-1/attachments");
		expect(list.status).toBe(200);
		const file = await t.api(response.body.url);
		expect(file.headers.get("content-type")).toStartWith("application/octet-stream");
	});

	test("a second upload of the same bytes reuses the one blob", async () => {
		const first = await upload("CDE-1", PNG);
		const second = await upload("CDE-2", PNG);

		expect(first.status).toBe(201);
		expect(second.status).toBe(201);
		expect(second.body.attachment.id).not.toBe(first.body.attachment.id);
		expect(second.body.attachment.sha256).toBe(first.body.attachment.sha256);
		expect((await t.api("/api/tickets/CDE-1/attachments")).body).toHaveLength(1);
		expect((await t.api("/api/tickets/CDE-2/attachments")).body).toHaveLength(1);
		expect(blobFiles()).toEqual([first.body.attachment.sha256]);
	});

	test("attachments list, get and delete answer with the metadata shape", async () => {
		const png = await upload("CDE-1", PNG);
		const text = await upload("CDE-1", new TextEncoder().encode("notes"), "notes.txt", "text/plain");
		expect(text.status).toBe(201);

		const list = await t.api("/api/tickets/CDE-1/attachments");
		const one = await t.api(`/api/attachments/${text.body.attachment.id}`);
		const deleted = await t.app.request(`http://trellis.test/api/attachments/${png.body.attachment.id}`, {
			method: "DELETE",
			headers: { "x-trellis-actor": "human:navid" },
		});

		expect(list.status).toBe(200);
		expect(list.body).toHaveLength(2);
		expect(one.status).toBe(200);
		expect(one.body).toMatchObject({ filename: "notes.txt", mime: "text/plain", size: 5 });
		expect(one.body.sha256).toMatch(/^[0-9a-f]{64}$/);
		expect(deleted.status).toBe(200);
		expect(await deleted.json()).toEqual({ deleted: png.body.attachment.id });
		expect((await t.api("/api/tickets/CDE-1/attachments")).body).toHaveLength(1);
	});

	test("a file with no type is stored as application/octet-stream and the ticket still reads", async () => {
		const response = await upload("CDE-1", new TextEncoder().encode("all:\n"), "Makefile", "");

		expect(response.status).toBe(201);
		expect(response.body.attachment).toMatchObject({ filename: "Makefile", mime: "application/octet-stream" });
		const ticket = await t.api("/api/tickets/CDE-1");
		const list = await t.api("/api/tickets/CDE-1/attachments");
		expect(ticket.status).toBe(200);
		expect(list.status).toBe(200);
		expect(list.body[0]).toMatchObject({ filename: "Makefile", mime: "application/octet-stream" });
	});

	test("a filename with a double quote uploads and the ticket still reads", async () => {
		const response = await upload("CDE-1", new TextEncoder().encode("hi"), 'say "hi".txt', "text/plain");

		expect(response.status).toBe(201);
		expect((await t.api("/api/tickets/CDE-1")).status).toBe(200);
		expect((await t.api("/api/tickets/CDE-1/attachments")).status).toBe(200);
	});

	test("the name field keeps a filename with a double quote whole", async () => {
		const form = new FormData();
		form.set("file", new File([new TextEncoder().encode("hi")], "say hi.txt", { type: "text/plain" }));
		form.set("name", 'say "hi".txt');

		const response = await t.api("/api/tickets/CDE-1/attachments", { method: "POST", raw: form });

		expect(response.status).toBe(201);
		const list = await t.api("/api/tickets/CDE-1/attachments");
		expect(list.status).toBe(200);
		expect(list.body[0].filename).toBe('say "hi".txt');
	});
});
