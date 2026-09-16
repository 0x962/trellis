import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { count, seedRoot } from "../../../fixtures";
import { freshDb, type TestDb } from "../../../helpers/db.ts";
import { checkNamed, UNIQUE } from "../../../helpers/errors.ts";

let h: TestDb;
beforeAll(async () => {
	h = await freshDb();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

const group = (projectId: string, name: string, position = 0) => {
	const id = ulid();
	return h.db
		.execute(
			sql`INSERT INTO label_groups (id, project_id, name, position, created_at, updated_at)
				VALUES (${id}, ${projectId}, ${name}, ${position}, now(), now())`,
		)
		.then(() => id);
};

const label = (groupId: string, name: string, color = "fg-muted", position = 0) =>
	h.db.execute(
		sql`INSERT INTO labels (id, group_id, name, color, position, created_at, updated_at)
			VALUES (${ulid()}, ${groupId}, ${name}, ${color}, ${position}, now(), now())`,
	);

describe("label groups and labels", () => {
	test("names stay trimmed, bounded, and unique in their local scope", async () => {
		const project = await seedRoot(h.db, "CDE");
		const type = await group(project, "Type");
		await expect(group(project, "type", 1)).rejects.toThrow(UNIQUE);
		await expect(group(project, " Type ", 1)).rejects.toThrow(checkNamed("label_groups_name_check"));
		await expect(group(project, "x".repeat(81), 1)).rejects.toThrow(checkNamed("label_groups_name_check"));
		await label(type, "Bug");
		await expect(label(type, "bug", "accent", 1)).rejects.toThrow(UNIQUE);
		await expect(label(type, " Bug ", "accent", 1)).rejects.toThrow(checkNamed("labels_name_check"));
	});

	test("labels accept theme colors and cascade with their project", async () => {
		const project = await seedRoot(h.db, "CDE");
		const type = await group(project, "Type");
		await label(type, "Bug", "danger");
		await expect(label(type, "Invalid", "blue", 1)).rejects.toThrow(checkNamed("labels_color_check"));
		await h.db.execute(sql`DELETE FROM projects WHERE id = ${project}`);
		expect(await count(h.db, "label_groups")).toBe(0);
		expect(await count(h.db, "labels")).toBe(0);
	});
});
