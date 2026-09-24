import { afterAll, expect, test } from "bun:test";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { migrate as runMigrations } from "drizzle-orm/pglite/migrator";
import { type Db, openDb } from "./client.ts";
import { migrate } from "./migrate.ts";

const migrationsDir = join(import.meta.dir, "../../drizzle");
const journal = JSON.parse(await readFile(join(migrationsDir, "meta/_journal.json"), "utf8")) as {
	version: string;
	dialect: string;
	entries: { idx: number; tag: string; when: number; version: string; breakpoints: boolean }[];
};
const fixturesDir = await mkdtemp(join(tmpdir(), "trellis-session-archive-migration-"));
const databases: Db[] = [];

afterAll(async () => {
	for (const db of databases) await db.$client.close();
	await rm(fixturesDir, { recursive: true });
});

test("a fresh database has a nullable session archive timestamp", async () => {
	const db = await openDb(":memory:");
	databases.push(db);
	expect(await migrate(db)).toBe(journal.entries.length);
	const column = await db.execute(sql`
		SELECT data_type, datetime_precision, is_nullable, column_default
		FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'sessions' AND column_name = 'archived_at'
	`);
	expect(column.rows).toEqual([
		{
			data_type: "timestamp with time zone",
			datetime_precision: 3,
			is_nullable: "YES",
			column_default: null,
		},
	]);
}, 60_000);

test("an upgrade preserves an existing session and its provider conversation", async () => {
	const earlierEntries = journal.entries.filter((entry) => entry.idx < 117);
	await mkdir(join(fixturesDir, "meta"));
	await writeFile(join(fixturesDir, "meta/_journal.json"), JSON.stringify({ ...journal, entries: earlierEntries }));
	for (const entry of earlierEntries) {
		await copyFile(join(migrationsDir, `${entry.tag}.sql`), join(fixturesDir, `${entry.tag}.sql`));
	}
	const db = await openDb(":memory:");
	databases.push(db);
	await runMigrations(db, { migrationsFolder: fixturesDir });
	await db.$client.exec(`
		INSERT INTO agent_runs
			(id, name, kind, instruction, project_key, harness, session_id, workspace_id, terminal_id, created_at, updated_at)
		VALUES
			('run', 'Existing session', 'session', 'Keep this conversation', '', '{"preset":"claude"}',
			 'provider-session', 'workspace', 'terminal', '2026-09-23T12:00:00Z', '2026-09-24T12:00:00Z');
		INSERT INTO sessions (id, name, directory, harness, run_id, created_at, updated_at)
		VALUES
			('session', 'Existing session', '/sessions/existing', '{"preset":"claude"}', 'run',
			 '2026-09-23T12:00:00Z', '2026-09-24T12:00:00Z');
	`);
	const sessionQuery = sql`
		SELECT id, name, directory, harness, run_id, created_at, updated_at FROM sessions WHERE id = 'session'
	`;
	const runQuery = sql`SELECT * FROM agent_runs WHERE id = 'run'`;
	const originalSession = await db.execute(sessionQuery);
	const originalRun = await db.execute(runQuery);

	expect(await migrate(db)).toBe(journal.entries.length - earlierEntries.length);
	expect((await db.execute(sessionQuery)).rows).toEqual(originalSession.rows);
	expect((await db.execute(runQuery)).rows).toEqual(originalRun.rows);
	expect((await db.execute(sql`SELECT archived_at FROM sessions WHERE id = 'session'`)).rows).toEqual([
		{ archived_at: null },
	]);

	await db.execute(sql`UPDATE sessions SET archived_at = '2026-09-24T13:00:00.123Z' WHERE id = 'session'`);
	expect(await migrate(db)).toBe(0);
	expect((await db.execute(sql`SELECT archived_at FROM sessions WHERE id = 'session'`)).rows).toEqual([
		{ archived_at: "2026-09-24 13:00:00.123+00" },
	]);
}, 60_000);
