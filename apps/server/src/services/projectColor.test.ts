import { beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { openTestDb } from "../db/testDb.ts";
import type { Tx } from "../db/tx.ts";
import { assertColorFree } from "./projectRows.ts";

// One database for the file, because a fresh one runs every migration and
// that costs seconds.
let db: Awaited<ReturnType<typeof openTestDb>>;

const at = new Date("2026-09-23T10:00:00.000Z");
const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

const holder = ulid();

const newProject = (key: string, color: string | null) => {
	const id = ulid();
	return db
		.execute(
			sql`INSERT INTO projects (id, root_id, key, slug, name, color, created_at, updated_at)
				VALUES (${id}, ${id}, ${key}, ${key.toLowerCase()}, ${key}, ${color}, ${at}, ${at})`,
		)
		.then(() => id);
};

// The migrations of a fresh database take about seven seconds, which is
// longer than the timeout a hook takes by default.
const openMs = 60_000;

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(
		sql`INSERT INTO projects (id, root_id, key, slug, name, color, created_at, updated_at)
			VALUES (${holder}, ${holder}, 'BLU', 'blu', 'Blue holder', 'blue', ${at}, ${at})`,
	);
}, openMs);

test("the database refuses a second project with one color", async () => {
	await expect(newProject("TKN", "blue")).rejects.toThrow(/projects_color_idx|duplicate key/i);
});

test("the database refuses a color that is not one of the five", async () => {
	await expect(newProject("YLW", "yellow")).rejects.toThrow(/projects_color_check/i);
});

test("any number of projects hold no color", async () => {
	await newProject("NC1", null);
	await newProject("NC2", null);
	const rows = await db.execute(sql`SELECT count(*)::int AS n FROM projects WHERE color IS NULL`);
	expect((rows.rows[0] as { n: number }).n).toBe(2);
});

test("a taken color is not free, and the project that holds it keeps it", async () => {
	await run(async (tx) => {
		await expect(assertColorFree(tx, "blue", null)).rejects.toThrow("A row with this value exists.");
		await expect(assertColorFree(tx, "blue", holder)).resolves.toBeUndefined();
		await expect(assertColorFree(tx, "teal", null)).resolves.toBeUndefined();
	});
});
