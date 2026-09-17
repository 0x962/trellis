import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createTestApp, type TestApp } from "../../../helpers/app.ts";
import { freshDb, type TestDb } from "../../../helpers/db.ts";

// The notes procedures over /api: a create with its Location, the list of a
// project, one note, a patch, a delete, and the duplicate title answer.

let h: TestDb;
let t: TestApp;
beforeAll(async () => {
	h = await freshDb();
});
beforeEach(async () => {
	await h.reset();
	t = await createTestApp({ db: h });
	await t.seedProject("CDE");
});
afterAll(() => h.close());
afterEach(() => t.close());

describe("notes", () => {
	test("notes.create answers 201 with a Location, and the list and the read return the note", async () => {
		const created = await t.api("/api/projects/CDE/notes", {
			method: "POST",
			body: { title: "Fresh worktree", body: "Run bun install first.", audience: "worker" },
		});
		expect(created.status).toBe(201);
		expect(created.body).toMatchObject({
			projectPath: "CDE",
			title: "Fresh worktree",
			audience: "worker",
			expiresAt: null,
			actor: { name: "dana", kind: "human" },
		});
		expect(created.headers.get("location")).toBe(`/api/notes/${created.body.id}`);

		const listed = await t.api("/api/projects/CDE/notes");
		expect(listed.status).toBe(200);
		expect(listed.body.map((note: { id: string }) => note.id)).toEqual([created.body.id]);

		const forManagers = await t.api("/api/projects/CDE/notes?audience=manager");
		expect(forManagers.body).toEqual([]);

		const read = await t.api(`/api/notes/${created.body.id}`);
		expect(read.status).toBe(200);
		expect(read.body.title).toBe("Fresh worktree");
	});

	test("notes.update changes the named fields and notes.delete removes the note", async () => {
		const created = await t.api("/api/projects/CDE/notes", {
			method: "POST",
			body: { title: "Disk", body: "89 GiB free." },
		});
		const patched = await t.api(`/api/notes/${created.body.id}`, {
			method: "PATCH",
			body: { body: "92 GiB free.", expiresAt: "2030-01-01T00:00:00.000Z" },
		});
		expect(patched.status).toBe(200);
		expect(patched.body).toMatchObject({ title: "Disk", body: "92 GiB free.", expiresAt: "2030-01-01T00:00:00.000Z" });

		const deleted = await t.api(`/api/notes/${created.body.id}`, { method: "DELETE" });
		expect(deleted.status).toBe(200);
		expect(deleted.body).toEqual({ id: created.body.id });
		const gone = await t.api(`/api/notes/${created.body.id}`);
		expect(gone.status).toBe(404);
		expect(gone.body.code).toBe("NOT_FOUND");
	});

	test("a repeated title in one project answers 409 DUPLICATE", async () => {
		await t.api("/api/projects/CDE/notes", { method: "POST", body: { title: "Disk", body: "One." } });
		const again = await t.api("/api/projects/CDE/notes", { method: "POST", body: { title: "disk", body: "Two." } });
		expect(again.status).toBe(409);
		expect(again.body.code).toBe("DUPLICATE");
		expect(again.body.data).toEqual({ field: "title" });
	});
});
