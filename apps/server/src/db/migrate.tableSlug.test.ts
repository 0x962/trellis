import { afterAll, beforeAll, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { seedChild, seedRoot } from "../../test/fixtures";
import { openDb } from "./client.ts";
import { migrate } from "./migrate.ts";

// `/p/CDE/table` is the table of the project CDE, so a sub-project whose
// slug is `table` has no URL of its own. Migration 0021 adds `table` to the
// slugs the projects table refuses. A database that already holds such a
// sub-project cannot take the new rule, so the migration stops and names
// that project instead of writing anything.

const drizzleDir = join(import.meta.dir, "../../drizzle");
const NAMED = "0021_reserve_table_slug";

type Journal = { entries: Array<{ tag: string }> };

let temp: string;
beforeAll(() => {
	temp = mkdtempSync(join(import.meta.dir, "../../.cache/migrate-table-slug-"));
});
afterAll(() => rmSync(temp, { recursive: true, force: true }));

// A copy of the migration directory whose journal ends at 0021, or at the
// migration before it. A migration run of the copy leaves the schema as it
// was at that point of the history.
const journalUntil = (name: string, includeNamed: boolean) => {
	const dir = join(temp, name);
	cpSync(drizzleDir, dir, { recursive: true });
	const path = join(dir, "meta/_journal.json");
	const journal = JSON.parse(readFileSync(path, "utf8")) as Journal;
	const at = journal.entries.findIndex((entry) => entry.tag === NAMED);
	journal.entries = journal.entries.slice(0, includeNamed ? at + 1 : at);
	writeFileSync(path, JSON.stringify(journal, null, 2));
	return dir;
};

test("server builder: migration 0021 stops and names the project that holds the slug table", async () => {
	const db = await openDb(":memory:");
	expect(await migrate(db, journalUntil("before-held", false))).toBeGreaterThan(0);
	const root = await seedRoot(db, "CDE");
	const web = await seedChild(db, root, root, "web");
	await seedChild(db, web, root, "table");
	await expect(migrate(db, journalUntil("held", true))).rejects.toThrow("CDE.web.table");
	await db.$client.close();
	// Two migration runs of one PGlite instance need more than the default
	// timeout of a test.
}, 120_000);

test("server builder: migration 0021 names every project that holds the slug, root and sub-project alike", async () => {
	const db = await openDb(":memory:");
	expect(await migrate(db, journalUntil("before-many", false))).toBeGreaterThan(0);
	const cde = await seedRoot(db, "CDE");
	await seedChild(db, cde, cde, "table");
	// A root takes its slug from its key, so the key TABLE gives the slug
	// table. /p/TABLE reads TABLE as the table view, so this root has no
	// page either and the migration must name it too.
	await seedRoot(db, "TABLE");
	const failed = migrate(db, journalUntil("many", true));
	await expect(failed).rejects.toThrow("CDE.table");
	await expect(failed).rejects.toThrow("TABLE");
	await db.$client.close();
}, 120_000);

test("server builder: migration 0021 passes without such a project and the slug table is then refused", async () => {
	const db = await openDb(":memory:");
	expect(await migrate(db, journalUntil("before-free", false))).toBeGreaterThan(0);
	const root = await seedRoot(db, "OPS");
	await seedChild(db, root, root, "web");
	expect(await migrate(db, journalUntil("free", true))).toBe(1);
	await expect(seedChild(db, root, root, "table")).rejects.toThrow("projects_slug_check");
	await seedChild(db, root, root, "tables");
	await db.$client.close();
}, 120_000);
