import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { originDir } from "../../../../../../test/originDir.ts";
import { openDb } from "../../../../src/db/client.ts";
import { migrate } from "../../../../src/db/migrate.ts";
import { seedActors, seedRoot, seedStatuses } from "../../../fixtures";
import { SEEDED_DESCRIPTIONS } from "../../../fixtures/statusDescriptions.ts";

// The migration 0013_remove_agents dropped the agent tables and rewrote the
// seeded status descriptions. 0020_restore_agents undoes both. Migrations
// run forward only, so 0020 must also leave a database that never ran 0013
// as it found it.

const drizzleDir = join(originDir(import.meta.dir), "../../drizzle");
const REMOVE = "0013_remove_agents";
const RESTORE = "0020_restore_agents";

type Journal = { entries: Array<{ tag: string }> };

const closers: Array<() => Promise<void>> = [];
afterAll(async () => {
	for (const close of closers) await close();
});

// A copy of the migrations folder whose journal stops before `tag`.
const foldersBefore = (tag: string) => {
	const temp = mkdtempSync(join(process.env.TRELLIS_HOME as string, "restore-agents-"));
	cpSync(drizzleDir, temp, { recursive: true });
	const path = join(temp, "meta/_journal.json");
	const journal = JSON.parse(readFileSync(path, "utf8")) as Journal;
	const index = journal.entries.findIndex((entry) => entry.tag === tag);
	expect(index).toBeGreaterThan(0);
	journal.entries = journal.entries.slice(0, index);
	writeFileSync(path, JSON.stringify(journal));
	return temp;
};

type TestDb = Awaited<ReturnType<typeof openDb>>;

// The migrator splits a migration file on this marker and runs each part.
const runMigrationFile = async (db: TestDb, tag: string) => {
	const file = readFileSync(join(drizzleDir, `${tag}.sql`), "utf8");
	for (const part of file.split("--> statement-breakpoint")) {
		const statement = part.trim();
		if (statement.length > 0) await db.execute(sql.raw(statement));
	}
};

const descriptionsByName = async (db: TestDb) => {
	const found = await db.execute(sql`SELECT name, description FROM statuses ORDER BY position`);
	return Object.fromEntries(found.rows.map((row) => [row.name, row.description]));
};

const tableExists = async (db: TestDb, name: string) => {
	const found = await db.execute(sql`SELECT to_regclass(${`public.${name}`}) AS reg`);
	return found.rows[0]?.reg !== null;
};

// A database at the last migration before the removal: both agent tables,
// one manager session, one cursor, and the seeded descriptions.
const beforeRemoval = async () => {
	const db = await openDb(":memory:");
	closers.push(() => db.$client.close());
	await migrate(db, foldersBefore(REMOVE));
	await seedActors(db);
	const rootId = await seedRoot(db, "CDE");
	await seedStatuses(db, rootId);
	for (const [name, description] of Object.entries(SEEDED_DESCRIPTIONS)) {
		await db.execute(sql`UPDATE statuses SET description = ${description} WHERE name = ${name}`);
	}
	const at = new Date("2026-09-01T10:00:00.000Z");
	await db.execute(sql`
		INSERT INTO agent_sessions (id, project_id, ticket_id, role, runner, state, name, title, created_at, updated_at)
		VALUES (${ulid()}, ${rootId}, NULL, 'manager', 'superset', 'running', 'Amara', 'CDE manager', ${at}, ${at})
	`);
	await db.execute(sql`INSERT INTO agent_cursors (project_id, activity_id, updated_at) VALUES (${rootId}, 7, ${at})`);
	return { db, rootId };
};

const sessionNames = async (db: TestDb) => {
	const found = await db.execute(sql`SELECT name FROM agent_sessions ORDER BY created_at`);
	return found.rows.map((row) => row.name as string);
};

describe("the agent restore migration", () => {
	test("gives back the agent tables and the manager's status descriptions after the removal", async () => {
		const { db } = await beforeRemoval();

		await runMigrationFile(db, REMOVE);
		expect(await tableExists(db, "agent_sessions")).toBe(false);
		expect(await tableExists(db, "agent_cursors")).toBe(false);
		expect((await descriptionsByName(db)).Todo).toBe(
			"Work awaits its start. Clarify the requirements before work starts.",
		);

		await runMigrationFile(db, RESTORE);

		expect(await tableExists(db, "agent_sessions")).toBe(true);
		expect(await tableExists(db, "agent_cursors")).toBe(true);
		expect(await descriptionsByName(db)).toEqual(SEEDED_DESCRIPTIONS);
	});

	// A database that ran 0013 must run 0020 too. A database that
	// stopped before 0013 still holds the tables and the rows, and 0020 must
	// keep both.
	test("keeps the rows and the descriptions of a database that never ran the removal", async () => {
		const { db, rootId } = await beforeRemoval();

		await runMigrationFile(db, RESTORE);
		await runMigrationFile(db, RESTORE);

		expect(await sessionNames(db)).toEqual(["Amara"]);
		const cursors = await db.execute(
			sql`SELECT activity_id::int AS id FROM agent_cursors WHERE project_id = ${rootId}`,
		);
		expect(cursors.rows[0]?.id).toBe(7);
		expect(await descriptionsByName(db)).toEqual(SEEDED_DESCRIPTIONS);
	});

	// The tables carry their foreign keys and their indexes after the
	// restore, so a session of a deleted project goes with it.
	test("the restored session table keeps its project foreign key and its indexes", async () => {
		const { db } = await beforeRemoval();
		await runMigrationFile(db, REMOVE);
		await runMigrationFile(db, RESTORE);

		const indexes = await db.execute(
			sql`SELECT indexname FROM pg_indexes WHERE tablename = 'agent_sessions' ORDER BY indexname`,
		);
		expect(indexes.rows.map((row) => row.indexname)).toEqual([
			"agent_sessions_live_manager_idx",
			"agent_sessions_pkey",
			"agent_sessions_project_id_role_state_idx",
			"agent_sessions_terminal_idx",
			"agent_sessions_ticket_id_idx",
		]);
		const keys = await db.execute(
			sql`SELECT conname FROM pg_constraint WHERE conrelid = 'agent_sessions'::regclass AND contype = 'f' ORDER BY conname`,
		);
		expect(keys.rows.map((row) => row.conname)).toEqual([
			"agent_sessions_project_id_projects_id_fk",
			"agent_sessions_ticket_id_tickets_id_fk",
		]);
	});
});
