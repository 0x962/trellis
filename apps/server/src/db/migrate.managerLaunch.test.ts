import { afterAll, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_AGENT_LAUNCH_COMMAND } from "@trellis/api";
import { sql } from "drizzle-orm";
import { openDb } from "./client.ts";
import { migrate } from "./migrate.ts";

const drizzleDir = join(import.meta.dir, "../../drizzle");
const closers: Array<() => Promise<void>> = [];

afterAll(async () => {
	for (const close of closers) await close();
});

const journalBeforeFix = () => {
	const dir = mkdtempSync(join(process.env.TRELLIS_HOME!, "manager-launch-migration-"));
	cpSync(drizzleDir, dir, { recursive: true });
	const file = join(dir, "meta/_journal.json");
	const journal = JSON.parse(readFileSync(file, "utf8"));
	journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx < 22);
	writeFileSync(file, JSON.stringify(journal));
	return dir;
};

test("the manager launch migration repairs the bad template and releases its interrupted run", async () => {
	const db = await openDb(":memory:");
	closers.push(() => db.$client.close());
	await migrate(db, journalBeforeFix());
	const bad =
		"{{superset}} ws create --local --project {{projectId}} --name {{ticket}} - {{name}} --branch {{branch}} --command {{agentCommand}} --json";
	await db.execute(
		sql`INSERT INTO settings (key, value, updated_at) VALUES ('agentLaunchCommand', ${JSON.stringify(bad)}::jsonb, NOW())`,
	);
	await db.execute(sql`
		INSERT INTO agent_runs (id, name, persona_name, kind, instruction, project_path, state, error, created_at, updated_at)
		VALUES ('run-1', 'Cleo Wren', 'Manager', 'manager', 'Manage.', 'TRL', 'interrupted', 'Error: Error: Unknown option: -', NOW(), NOW());
	`);

	expect(await migrate(db)).toBe(1);
	const setting = await db.execute(sql`SELECT value FROM settings WHERE key = 'agentLaunchCommand'`);
	const run = await db.execute(sql`SELECT state FROM agent_runs WHERE id = 'run-1'`);
	expect(setting.rows[0]?.value).toBe(DEFAULT_AGENT_LAUNCH_COMMAND);
	expect(run.rows[0]?.state).toBe("failed");
});
