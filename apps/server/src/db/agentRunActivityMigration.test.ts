import { afterAll, expect, test } from "bun:test";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { migrate as runMigrations } from "drizzle-orm/pglite/migrator";
import { projectRun } from "../services/agentRuns/liveState.ts";
import { listColumns, type StoredRun, storedRows } from "../services/agentRuns/queries.ts";
import { openDb } from "./client.ts";

const migrationsDir = join(import.meta.dir, "../../drizzle");
const journal = JSON.parse(await readFile(join(migrationsDir, "meta/_journal.json"), "utf8")) as {
	version: string;
	dialect: string;
	entries: { idx: number; tag: string; when: number; version: string; breakpoints: boolean }[];
};
const fixturesDir = await mkdtemp(join(tmpdir(), "trellis-agent-activity-migration-"));

afterAll(async () => {
	await rm(fixturesDir, { recursive: true });
});

test("migration 0124 preserves recent stored activity without a runtime record", async () => {
	const earlierEntries = journal.entries.filter((entry) => entry.idx < 124);
	await mkdir(join(fixturesDir, "meta"));
	await writeFile(join(fixturesDir, "meta/_journal.json"), JSON.stringify({ ...journal, entries: earlierEntries }));
	for (const entry of earlierEntries)
		await copyFile(join(migrationsDir, `${entry.tag}.sql`), join(fixturesDir, `${entry.tag}.sql`));

	const db = await openDb(":memory:");
	try {
		await runMigrations(db, { migrationsFolder: fixturesDir });
		await db.execute(sql`INSERT INTO agent_runs
			(id, name, kind, instruction, project_key, created_at, updated_at)
			VALUES ('recent-run', 'Recent session', 'session', 'Keep the conversation.', '',
			'2026-09-22T12:00:00.000Z', '2026-09-25T11:00:00.000Z')`);
		await db.execute(sql`INSERT INTO agent_execution_attempts
			(id, run_id, generation, token_hash, created_at)
			VALUES ('old-attempt', 'recent-run', 1, 'hash', '2026-09-22T12:00:00.000Z')`);
		await db.$client.exec(await readFile(join(migrationsDir, "0124_friendly_wilson_fisk.sql"), "utf8"));

		const [run] = await db.transaction((tx) =>
			storedRows<StoredRun>(tx, sql`SELECT ${listColumns} FROM agent_runs WHERE id='recent-run'`),
		);
		expect(projectRun(run!, []).activityAt).toBe("2026-09-25T11:00:00.000Z");
	} finally {
		await db.$client.close();
	}
}, 60_000);
