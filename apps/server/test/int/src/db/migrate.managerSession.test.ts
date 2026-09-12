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

// A copy of the migration folder whose journal stops below `max`, so a run
// against it applies the migrations before that index only.
const journalUnder = (max: number) => {
	const dir = mkdtempSync(join(process.env.TRELLIS_HOME!, "manager-session-migration-"));
	cpSync(drizzleDir, dir, { recursive: true });
	const file = join(dir, "meta/_journal.json");
	const journal = JSON.parse(readFileSync(file, "utf8"));
	journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx < max);
	writeFileSync(file, JSON.stringify(journal));
	return dir;
};

// An interrupted manager with no workspace holds no terminal a refresh can
// find. The partial unique index counts it as live, so it blocked every
// start of the newer manager row of the same project.
test("the manager session migration adds the session columns and fails the managers no refresh can find", async () => {
	const db = await openDb(":memory:");
	closers.push(() => db.$client.close());
	await migrate(db, journalUnder(26));
	await db.execute(sql`
		INSERT INTO agent_runs (id, name, persona_name, kind, instruction, project_path, state, workspace_id, error, created_at, updated_at)
		VALUES
			('run-old', 'Cleo Wren', 'Manager', 'manager', 'Manage.', 'TRL', 'interrupted', NULL, 'Error: Project is not set up on this host', NOW() - interval '1 hour', NOW()),
			('run-new', 'Wren', 'Manager', 'manager', 'Manage.', 'TRL', 'stopped', 'ws-1', NULL, NOW(), NOW()),
			('run-tmux', 'Iris', 'Manager', 'manager', 'Manage.', 'OP', 'interrupted', '/home/agents/run-tmux/work', NULL, NOW(), NOW());
	`);
	await migrate(db, journalUnder(27));
	const { rows } = await db.execute(sql`SELECT id, state, session_id, session_lost FROM agent_runs ORDER BY id`);
	expect(rows).toEqual([
		{ id: "run-new", state: "stopped", session_id: null, session_lost: false },
		{ id: "run-old", state: "failed", session_id: null, session_lost: false },
		{ id: "run-tmux", state: "interrupted", session_id: null, session_lost: false },
	]);
});
