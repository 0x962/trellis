import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { hoursAgo, seedChild, seedProject } from "../../test/fixtures";
import {
	activityRows,
	at,
	eventsOfType,
	expectError,
	type Harness,
	NOW,
	serviceHarness,
} from "../../test/helpers/services.ts";
import * as projects from "./projects.ts";
import { resolveProject } from "./refs.ts";

// An update writes one activity row per field that changed and nothing for
// a field that keeps its value. A slug change renames the dotted path of
// the whole subtree. A key change is free until the first ticket is
// numbered. `archived` toggles archived_at.

let h: Harness;
beforeAll(async () => {
	h = await serviceHarness();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

type ProjectRow = {
	name: string;
	slug: string;
	key: string | null;
	description: string;
	ticket_template: string;
	archived_at: string | null;
	updated_at: string;
};

const projectRow = (id: string) =>
	h.one<ProjectRow>(
		sql`SELECT name, slug, key, description, ticket_template, ${at("archived_at")}, ${at("updated_at")} FROM projects WHERE id = ${id}`,
	);

// CDE with the sub-projects web and api, and web > auth. Every row was
// last updated an hour before NOW.
const seedTree = async () => {
	const { rootId: cde } = await seedProject(h.db, "CDE");
	await h.db.execute(sql`UPDATE projects SET updated_at = ${hoursAgo(1)}`);
	const web = await seedChild(h.db, cde, cde, "web", {
		name: "Web",
		description: "Old text",
		ticket_template: "## Old",
		updated_at: hoursAgo(1),
	});
	const auth = await seedChild(h.db, web, cde, "auth");
	const api = await seedChild(h.db, cde, cde, "api");
	await h.rebuild();
	return { cde, web, auth, api };
};

const update = (input: Parameters<typeof projects.update>[2]) => h.run((ctx, tx) => projects.update(ctx, tx, input));

describe("projects.update fields", () => {
	test("an update writes one activity row per changed field", async () => {
		const { web } = await seedTree();
		const updated = await update({
			project: "CDE.web",
			name: "Site",
			description: "New text",
			ticketTemplate: "## New",
		});
		expect(updated.name).toBe("Site");
		const row = await projectRow(web);
		expect(row.name).toBe("Site");
		expect(row.description).toBe("New text");
		expect(row.ticket_template).toBe("## New");
		expect(row.updated_at).toBe(NOW.toISOString());
		const rows = await activityRows(h);
		expect(rows.map((activity) => activity.field).sort()).toEqual(["description", "name", "ticketTemplate"]);
		expect(new Set(rows.map((activity) => activity.batch_id)).size).toBe(1);
		for (const activity of rows) {
			expect(activity.ticket_id).toBeNull();
			expect(activity.project_id).toBe(web);
		}
	});

	test("an update to the same value writes nothing", async () => {
		const { web } = await seedTree();
		await update({ project: "CDE.web", name: "Web" });
		expect(await activityRows(h)).toEqual([]);
		expect((await projectRow(web)).updated_at).toBe(hoursAgo(1).toISOString());
		expect(h.flushed).toEqual([]);
	});

	test("a slug change moves the dotted path of the whole subtree", async () => {
		const { auth } = await seedTree();
		const updated = await update({ project: "CDE.web", slug: "site" });
		expect(updated.path).toBe("CDE.site");
		const found = await h.read((tx) =>
			resolveProject(
				h.ctx(() => {}),
				tx,
				"CDE.site.auth",
			),
		);
		expect(found.id).toBe(auth);
		await expectError(
			h.read((tx) =>
				resolveProject(
					h.ctx(() => {}),
					tx,
					"CDE.web.auth",
				),
			),
			"NOT_FOUND",
		);
	});

	test("a slug that collides with a sibling throws DUPLICATE", async () => {
		const { api } = await seedTree();
		const error = await expectError(update({ project: "CDE.api", slug: "web" }), "DUPLICATE");
		expect(error.data).toEqual({ field: "slug" });
		expect((await projectRow(api)).slug).toBe("api");
	});
});

describe("projects.update key", () => {
	test("a key change is free while the ticket counter is zero", async () => {
		const { cde } = await seedTree();
		const updated = await update({ project: "CDE", key: "COD" });
		expect(updated.key).toBe("COD");
		const row = await projectRow(cde);
		expect(row.key).toBe("COD");
		expect(row.slug).toBe("cod");
		expect(await activityRows(h)).toHaveLength(1);
	});

	test("a key change after the counter moves throws KEY_LOCKED", async () => {
		const { cde } = await seedTree();
		await h.db.execute(sql`UPDATE projects SET ticket_counter = 1 WHERE id = ${cde}`);
		await h.rebuild();
		await expectError(update({ project: "CDE", key: "COD" }), "KEY_LOCKED");
		expect((await projectRow(cde)).key).toBe("CDE");
	});
});

describe("projects.update archived", () => {
	test("archive sets archived_at and unarchive clears it", async () => {
		const { web } = await seedTree();
		const archived = await update({ project: "CDE.web", archived: true });
		expect(archived.archivedAt).toBe(NOW.toISOString());
		expect((await projectRow(web)).archived_at).toBe(NOW.toISOString());
		expect(eventsOfType(h.flushed, "project.updated")).toEqual([{ type: "project.updated", id: web }]);

		const restored = await update({ project: "CDE.web", archived: false });
		expect(restored.archivedAt).toBeNull();
		expect((await projectRow(web)).archived_at).toBeNull();
		expect(eventsOfType(h.flushed, "project.updated")).toHaveLength(2);
	});
});
