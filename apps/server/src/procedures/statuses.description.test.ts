import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Status } from "@trellis/api";
import { sql } from "drizzle-orm";
import { seedProject } from "../../test/fixtures";
import { SEEDED_DESCRIPTIONS } from "../../test/fixtures/statusDescriptions.ts";
import { createTestApp, type TestApp } from "../../test/helpers/app.ts";
import { freshDb } from "../../test/helpers/db.ts";
import { rows } from "../db/queries/support.ts";

// Each test uses a separate project, so status changes stay inside that test.

let t: TestApp;
let count = 0;
let key = "";
beforeEach(async () => {
	t = await createTestApp();
	count += 1;
	key = `D${count}`;
});
afterEach(() => t.close());

const descriptionsByName = (statuses: Status[]) =>
	Object.fromEntries(statuses.map((status) => [status.name, status.description]));

const readActivity = async (projectId: string) =>
	t.serverTx((tx) =>
		rows<{
			action: string;
			field: string | null;
			fromValue: string | null;
			toValue: string | null;
			meta: { deltaChars: number };
		}>(
			tx,
			sql`SELECT action, field, from_value AS "fromValue", to_value AS "toValue", meta
	FROM activity WHERE project_id = ${projectId} AND action = 'status.updated' ORDER BY id`,
		),
	);

describe("status descriptions", () => {
	test("server builder: the migration adds statuses.description as text not null default ''", async () => {
		const h = await freshDb();
		const found = await h.db.execute(sql`
			SELECT data_type, is_nullable, column_default FROM information_schema.columns
			WHERE table_name = 'statuses' AND column_name = 'description'`);
		expect(found.rows).toEqual([{ data_type: "text", is_nullable: "NO", column_default: "''::text" }]);
		const { rootId } = await seedProject(h.db);
		await expect(
			h.db.execute(sql`UPDATE statuses SET description = ${"x".repeat(2001)} WHERE project_id = ${rootId}`),
		).rejects.toThrow(/statuses_description_check/);
		await h.close();
	});

	test("server builder: statuses.create stores the description and statuses.list returns it", async () => {
		await t.seedProject(key);
		const description = "Deploy every ticket here, then move it to Done after a human approves.";
		const created = await t.api(`/api/projects/${key}/statuses`, {
			method: "POST",
			body: { name: "Deploy Queue", category: "started", description },
		});
		expect(created.status).toBe(201);
		expect(created.body.description).toBe(description);
		const listed = await t.api(`/api/projects/${key}/statuses`, { actor: null });
		expect(descriptionsByName(listed.body.statuses)["Deploy Queue"]).toBe(description);
	});

	test("server builder: statuses.update changes the description and writes one activity row", async () => {
		const project = await t.seedProject(key);
		const description = "New work. Start a builder at once.";
		const updated = await t.api(`/api/projects/${key}/statuses/todo`, { method: "PATCH", body: { description } });
		expect(updated.status).toBe(200);
		expect(updated.body.description).toBe(description);

		const again = await t.api(`/api/projects/${key}/statuses/todo`, { method: "PATCH", body: { description } });
		expect(again.status).toBe(200);
		const changed = await readActivity(project.id);
		expect(changed).toHaveLength(1);
		expect(changed[0]).toMatchObject({ field: "description", fromValue: null, toValue: null });
		expect(changed[0]!.meta.deltaChars).toBe(description.length - SEEDED_DESCRIPTIONS.Todo!.length);
	});

	test("server builder: a new root project seeds a description for each default status", async () => {
		const project = await t.seedProject(key);
		expect(descriptionsByName(project.statuses)).toEqual(SEEDED_DESCRIPTIONS);
	});

	test("server builder: a sub-project that takes its own set copies the descriptions", async () => {
		await t.seedProject(key);
		const sub = await t.api("/api/projects", { method: "POST", body: { parent: key, name: "Web", slug: "web" } });
		expect(sub.status).toBe(201);
		const blocked = await t.api(`/api/projects/${key}.web/statuses`, {
			method: "POST",
			body: { name: "Blocked", category: "started" },
		});
		expect(blocked.status).toBe(201);
		const listed = await t.api(`/api/projects/${key}.web/statuses`, { actor: null });
		expect(listed.body.inheritedFrom).toBeNull();
		expect(descriptionsByName(listed.body.statuses)).toEqual({ ...SEEDED_DESCRIPTIONS, Blocked: "" });
	});
});
