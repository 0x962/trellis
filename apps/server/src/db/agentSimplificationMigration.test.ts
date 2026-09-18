import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { openDb } from "./client.ts";

const migrationsDir = join(import.meta.dir, "../../drizzle");

test("the agent simplification migration preserves project directories and removes obsolete records", async () => {
	const db = await openDb(":memory:");
	try {
		const earlierMigrations = readdirSync(migrationsDir)
			.filter((name) => /^\d{4}.*\.sql$/.test(name) && Number(name.slice(0, 4)) < 74)
			.sort();
		for (const migration of earlierMigrations) {
			await db.$client.exec(readFileSync(join(migrationsDir, migration), "utf8"));
		}
		await db.$client.exec(`
			INSERT INTO actors (name, kind, first_seen_at, last_seen_at)
			VALUES ('Test', 'human', now(), now());
			INSERT INTO projects (id, root_id, key, slug, name, manager_config, created_at, updated_at)
			VALUES ('project', 'project', 'TST', 'test', 'Test', '{"instruction":"old","directory":"/repo"}', now(), now());
			INSERT INTO agent_runs (id, name, kind, instruction, project_id, project_path, created_at, updated_at)
			VALUES ('old-project-agent', 'Project agent', 'manager', 'old', 'project', 'TST', now(), now());
			INSERT INTO notes (id, project_id, title, body, audience, actor_name, actor_kind, created_at, updated_at)
			VALUES ('old-note', 'project', 'Old note', 'old', 'manager', 'Test', 'human', now(), now());
		`);

		await db.$client.exec(readFileSync(join(migrationsDir, "0074_motionless_purple_man.sql"), "utf8"));

		const project = await db.execute(sql`SELECT directory FROM projects WHERE id = 'project'`);
		expect(project.rows).toEqual([{ directory: "/repo" }]);
		const removedRows = await db.execute(sql`
			SELECT
				(SELECT count(*)::int FROM agent_runs WHERE id = 'old-project-agent') AS runs,
				(SELECT count(*)::int FROM notes WHERE id = 'old-note') AS notes
		`);
		expect(removedRows.rows).toEqual([{ runs: 0, notes: 0 }]);
		const removedTables = await db.execute(sql`
			SELECT
				to_regclass('agent_sessions') AS sessions,
				to_regclass('manager_dispatches') AS dispatches,
				to_regclass('manager_delegations') AS delegations
		`);
		expect(removedTables.rows).toEqual([{ sessions: null, dispatches: null, delegations: null }]);
	} finally {
		await db.$client.close();
	}
});
