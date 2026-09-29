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
const fixturesDir = await mkdtemp(join(tmpdir(), "trellis-session-names-migration-"));
let db: Db;

afterAll(async () => {
	await db?.$client.close();
	await rm(fixturesDir, { recursive: true });
});

test("the name constraint upgrade preserves the session and provider conversation", async () => {
	const migration = journal.entries.find((entry) => entry.tag.endsWith("_session_name_length"))!;
	const earlierEntries = journal.entries.filter((entry) => entry.idx < migration.idx);
	await mkdir(join(fixturesDir, "meta"));
	await writeFile(join(fixturesDir, "meta/_journal.json"), JSON.stringify({ ...journal, entries: earlierEntries }));
	for (const entry of earlierEntries) {
		await copyFile(join(migrationsDir, `${entry.tag}.sql`), join(fixturesDir, `${entry.tag}.sql`));
	}
	db = await openDb(":memory:");
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
	const sessionQuery = sql`SELECT * FROM sessions WHERE id = 'session'`;
	const runQuery = sql`SELECT * FROM agent_runs WHERE id = 'run'`;
	const originalSession = await db.execute(sessionQuery);
	const originalRun = await db.execute(runQuery);
	const name = "界".repeat(4096);
	await expect(db.execute(sql`UPDATE sessions SET name = ${name} WHERE id = 'session'`)).rejects.toThrow();
	expect(await migrate(db)).toBe(journal.entries.length - earlierEntries.length);
	expect((await db.execute(sessionQuery)).rows).toEqual(originalSession.rows);
	expect((await db.execute(runQuery)).rows).toEqual(originalRun.rows);
	await db.execute(sql`UPDATE sessions SET name = ${name} WHERE id = 'session'`);
	expect((await db.execute(sessionQuery)).rows).toEqual([{ ...originalSession.rows[0], name }]);
	expect((await db.execute(runQuery)).rows).toEqual(originalRun.rows);
	expect(await migrate(db)).toBe(0);
}, 60_000);
