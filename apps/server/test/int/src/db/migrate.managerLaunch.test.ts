import { afterAll, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { originDir } from "../../../../../../test/originDir.ts";
import { openDb } from "../../../../src/db/client.ts";
import { migrate } from "../../../../src/db/migrate.ts";

const drizzleDir = join(originDir(import.meta.dir), "../../drizzle");
const closers: Array<() => Promise<void>> = [];

afterAll(async () => {
	for (const close of closers) await close();
});

// A copy of the migration folder whose journal stops below `max`. A run
// against it applies the migrations before that index only, so a test drives
// one migration and reads what that migration alone wrote.
const journalUnder = (max: number) => {
	const dir = mkdtempSync(join(process.env.TRELLIS_HOME!, "manager-launch-migration-"));
	cpSync(drizzleDir, dir, { recursive: true });
	const file = join(dir, "meta/_journal.json");
	const journal = JSON.parse(readFileSync(file, "utf8"));
	journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx < max);
	writeFileSync(file, JSON.stringify(journal));
	return dir;
};

test("the manager launch migration repairs the bad template and releases its interrupted run", async () => {
	const db = await openDb(":memory:");
	closers.push(() => db.$client.close());
	await migrate(db, journalUnder(22));
	const bad =
		"{{superset}} ws create --local --project {{projectId}} --name {{ticket}} - {{name}} --branch {{branch}} --command {{agentCommand}} --json";
	await db.execute(
		sql`INSERT INTO settings (key, value, updated_at) VALUES ('agentLaunchCommand', ${JSON.stringify(bad)}::jsonb, NOW())`,
	);
	await db.execute(sql`
		INSERT INTO agent_runs (id, name, persona_name, kind, instruction, project_path, state, error, created_at, updated_at)
		VALUES ('run-1', 'Cleo Wren', 'Manager', 'manager', 'Manage.', 'TRL', 'interrupted', 'Error: Error: Unknown option: -', NOW(), NOW());
	`);

	// Migration 0022 alone, so this test reads what 0022 wrote. Migration 0023
	// moves the same row on to the current default, and its own test covers it.
	expect(await migrate(db, journalUnder(23))).toBe(1);
	const setting = await db.execute(sql`SELECT value FROM settings WHERE key = 'agentLaunchCommand'`);
	const run = await db.execute(sql`SELECT state FROM agent_runs WHERE id = 'run-1'`);
	// The text migration 0022 writes, spelled out. A migration that has run on a
	// real database never changes, so it still writes the default of the day it
	// was written. DEFAULT_AGENT_LAUNCH_COMMAND has moved on since, and reading
	// it here would fail this test on every later change to the default.
	const repaired =
		"{{superset}} ws create --local --project {{projectId}} --name {{name}} --branch {{branch}} --command {{agentCommand}} --json";
	expect(setting.rows[0]?.value).toBe(repaired);
	expect(run.rows[0]?.state).toBe("failed");
});
