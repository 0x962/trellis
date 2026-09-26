import { afterAll, beforeAll, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { Db } from "./client.ts";
import { openTestDb } from "./testDb.ts";

// `0111_project_color_default.sql` gives a color to the projects of a database
// that a person built before a project held a color. The test database runs
// every migration on an empty database, so this file inserts the projects
// first and then runs that one file again.

const at = new Date("2026-09-23T12:00:00.000Z");
const migration = join(import.meta.dir, "../../drizzle/0111_project_color_default.sql");

let db: Db;

const newProject = (key: string, color: string | null, archived: Date | null) =>
	db.execute(
		sql`INSERT INTO projects (id, key, slug, name, color, archived_at, created_at, updated_at)
			VALUES (${ulid()}, ${key}, ${key.toLowerCase()}, ${key}, ${color}, ${archived}, ${at}, ${at})`,
	);

const colorOf = async (key: string) => {
	const found = await db.execute(sql`SELECT color FROM projects WHERE key = ${key}`);
	return (found.rows[0] as { color: string | null }).color;
};

beforeAll(async () => {
	db = await openTestDb();
	await db.$client.exec(await readFile(join(import.meta.dir, "../../drizzle/0113_project_color_palette.sql"), "utf8"));
}, 60_000);

afterAll(async () => {
	await db.$client.close();
});

test("the migration colors every active project that holds none", async () => {
	await newProject("HELD", "teal", null);
	for (const key of ["AAA", "BBB", "CCC", "DDD", "EEE"]) await newProject(key, null, null);
	await newProject("GONE", null, at);

	await db.execute(sql.raw(await readFile(migration, "utf8")));

	const found = await db.execute(
		sql`SELECT key, color FROM projects WHERE archived_at IS NULL AND key <> 'HELD' ORDER BY key`,
	);
	const colors = (found.rows as { color: string | null }[]).map((row) => row.color);
	expect(colors.filter((color) => color !== null).sort()).toEqual(["azure", "blue", "orange", "pink"]);
	expect(colors.filter((color) => color === null)).toHaveLength(1);
	expect(await colorOf("HELD")).toBe("teal");
	expect(await colorOf("GONE")).toBeNull();
});
