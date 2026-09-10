import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type { Status } from "@trellis/api";
import { sql } from "drizzle-orm";
import { SEEDED_DESCRIPTIONS } from "../../test/fixtures/statusDescriptions.ts";
import { createTestApp, type TestApp } from "../../test/helpers/app.ts";
import { freshDb, type TestDb } from "../../test/helpers/db.ts";

// The status description is the manager's rulebook for that status. The
// manager reads every description of the set at start and on
// statuses.changed, so the description travels with every status.

let h: TestDb;
let t: TestApp;
beforeAll(async () => {
	h = await freshDb();
});
beforeEach(async () => {
	await h.reset();
	t = await createTestApp({ db: h });
});
afterAll(async () => {
	await t.close();
	h.close();
});

const descriptionsByName = (statuses: Status[]) =>
	Object.fromEntries(statuses.map((status) => [status.name, status.description]));

describe("status descriptions", () => {
	test("server builder: the migration adds statuses.description as text not null default ''", async () => {
		const found = await h.db.execute(sql`
			SELECT data_type, is_nullable, column_default FROM information_schema.columns
			WHERE table_name = 'statuses' AND column_name = 'description'`);
		expect(found.rows).toEqual([{ data_type: "text", is_nullable: "NO", column_default: "''::text" }]);
		const project = await t.seedProject();
		await expect(
			h.db.execute(sql`UPDATE statuses SET description = ${"x".repeat(2001)} WHERE project_id = ${project.id}`),
		).rejects.toThrow(/statuses_description_check/);
	});

	test("server builder: statuses.create stores the description and statuses.list returns it", async () => {
		await t.seedProject();
		const description = "Deploy every ticket here, then move it to Done after a human approves.";
		const created = await t.api("/api/projects/CDE/statuses", {
			method: "POST",
			body: { name: "Deploy Queue", category: "started", description },
		});
		expect(created.status).toBe(201);
		expect(created.body.description).toBe(description);
		const listed = await t.api("/api/projects/CDE/statuses", { actor: null });
		expect(descriptionsByName(listed.body.statuses)["Deploy Queue"]).toBe(description);
	});

	test("server builder: statuses.update changes the description and writes one activity row", async () => {
		await t.seedProject();
		const description = "New work. Start a builder at once.";
		const updated = await t.api("/api/projects/CDE/statuses/todo", { method: "PATCH", body: { description } });
		expect(updated.status).toBe(200);
		expect(updated.body.description).toBe(description);
		const rows = await h.db.execute(
			sql`SELECT field, from_value, to_value, meta FROM activity WHERE action = 'status.updated' ORDER BY id`,
		);
		expect(rows.rows).toHaveLength(1);
		expect(rows.rows[0]).toMatchObject({ field: "description", from_value: null, to_value: null });
		expect((rows.rows[0]!.meta as { deltaChars: number }).deltaChars).toBe(
			description.length - SEEDED_DESCRIPTIONS.Todo!.length,
		);
		const again = await t.api("/api/projects/CDE/statuses/todo", { method: "PATCH", body: { description } });
		expect(again.status).toBe(200);
		const after = await h.db.execute(sql`SELECT count(*)::int AS n FROM activity WHERE action = 'status.updated'`);
		expect(after.rows[0]!.n).toBe(1);
	});

	test("server builder: a new root project seeds a description for each default status", async () => {
		const project = await t.seedProject();
		expect(descriptionsByName(project.statuses)).toEqual(SEEDED_DESCRIPTIONS);
	});

	test("server builder: a sub-project that takes its own set copies the descriptions", async () => {
		await t.seedProject();
		const sub = await t.api("/api/projects", { method: "POST", body: { parent: "CDE", name: "Web", slug: "web" } });
		expect(sub.status).toBe(201);
		const blocked = await t.api("/api/projects/CDE.web/statuses", {
			method: "POST",
			body: { name: "Blocked", category: "started" },
		});
		expect(blocked.status).toBe(201);
		const listed = await t.api("/api/projects/CDE.web/statuses", { actor: null });
		expect(listed.body.inheritedFrom).toBeNull();
		expect(descriptionsByName(listed.body.statuses)).toEqual({ ...SEEDED_DESCRIPTIONS, Blocked: "" });
	});
});
