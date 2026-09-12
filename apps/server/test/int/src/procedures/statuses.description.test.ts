import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type { Activity, Status } from "@trellis/api";
import { sql } from "drizzle-orm";
import { seedProject } from "../../../fixtures";
import { SEEDED_DESCRIPTIONS } from "../../../fixtures/statusDescriptions.ts";
import { createTestApp, type TestApp } from "../../../helpers/app.ts";
import { freshDb } from "../../../helpers/db.ts";

// The status description is the manager's rulebook for that status. The
// manager reads every description of the set at start and on
// statuses.changed, so the description travels with every status. The file
// has one app, and every test works in a project of its own key.

let t: TestApp;
let count = 0;
let key = "";
beforeAll(async () => {
	t = await createTestApp();
});
beforeEach(() => {
	count += 1;
	key = `D${count}`;
});
afterAll(() => t.close());

const descriptionsByName = (statuses: Status[]) =>
	Object.fromEntries(statuses.map((status) => [status.name, status.description]));

// The activity rows of the project after the previous read, through the
// manager inbox, which returns every row of the project.
const readActivity = async (): Promise<Activity[]> => {
	const response = await t.api("/api/agents/inbox", { method: "POST", body: { project: key } });
	expect(response.status).toBe(200);
	return response.body.events;
};

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
		await t.seedProject(key);
		await readActivity();
		const description = "New work. Start a builder at once.";
		const updated = await t.api(`/api/projects/${key}/statuses/todo`, { method: "PATCH", body: { description } });
		expect(updated.status).toBe(200);
		expect(updated.body.description).toBe(description);
		const rows = (await readActivity()).filter((row) => row.action === "status.updated");
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ field: "description", fromValue: null, toValue: null });
		expect(rows[0]!.meta.deltaChars).toBe(description.length - SEEDED_DESCRIPTIONS.Todo!.length);
		const again = await t.api(`/api/projects/${key}/statuses/todo`, { method: "PATCH", body: { description } });
		expect(again.status).toBe(200);
		expect((await readActivity()).filter((row) => row.action === "status.updated")).toEqual([]);
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
