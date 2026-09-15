import { afterAll, beforeAll, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { migrate as applyMigrations } from "drizzle-orm/pglite/migrator";
import { ulid } from "ulid";
import { originDir } from "../../../../../../test/originDir.ts";
import { openDb } from "../../../../src/db/client.ts";
import { seedProject, seedTicket } from "../../../fixtures";

// A database that agents already ran in holds sessions without a name.
// Migration 0012 adds the name column and gives every stored session a
// name, so no row is left without one. The later migration 0013 drops the
// agent tables and 0020 creates them again with the name column, so this
// test stops each of its two migration runs at 0012.

const drizzleDir = join(originDir(import.meta.dir), "../../drizzle");
const NAMED = "0012_agent_names";

type Journal = { entries: Array<{ tag: string }> };

let temp: string;
beforeAll(() => {
	temp = mkdtempSync(join(originDir(import.meta.dir), "../../.cache/migrate-names-"));
});
afterAll(() => rmSync(temp, { recursive: true, force: true }));

// A copy of the migration directory whose journal ends at 0012, or at the
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

const session = (db: Awaited<ReturnType<typeof openDb>>, projectId: string, ticketId: string, at: Date) =>
	db.execute(sql`
		INSERT INTO agent_sessions (id, project_id, ticket_id, role, runner, state, title, created_at, updated_at)
		VALUES (${ulid()}, ${projectId}, ${ticketId}, 'builder', 'superset', 'running', 'CDE-1', ${at}, ${at})
	`);

test("server builder: migration 0012 names every session that the database already holds", async () => {
	const db = await openDb(":memory:");
	await applyMigrations(db, { migrationsFolder: journalUntil("before", false) });
	const { rootId, statuses } = await seedProject(db);
	const ticketId = await seedTicket(db, { projectId: rootId, rootId, statusId: statuses.todo });
	const start = new Date("2026-09-01T10:00:00.000Z");
	for (const minute of [0, 1, 2]) {
		await session(db, rootId, ticketId, new Date(start.getTime() + minute * 60_000));
	}
	await applyMigrations(db, { migrationsFolder: journalUntil("named", true) });
	const found = await db.execute(sql`SELECT name FROM agent_sessions ORDER BY created_at`);
	const names = found.rows.map((row) => row.name as string);
	expect(names).toHaveLength(3);
	for (const name of names) expect(name).toMatch(/^[A-Z][a-z]+$/);
	expect(new Set(names).size).toBe(3);
	await db.$client.close();
	// Two migration runs of one PGlite instance need more than the default
	// timeout of a test.
}, 120_000);
