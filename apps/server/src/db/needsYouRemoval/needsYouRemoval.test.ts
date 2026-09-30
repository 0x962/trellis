import { expect, test } from "bun:test";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate as runMigrations } from "drizzle-orm/pglite/migrator";
import { type Db, openDb } from "../client.ts";
import { migrate } from "../migrate.ts";

const migrations = join(import.meta.dir, "../../../drizzle");
const removalIndex = 146;

async function writeHistory(directory: string, lastIndex: number) {
	const journal = JSON.parse(await readFile(join(migrations, "meta/_journal.json"), "utf8")) as {
		entries: { idx: number; tag: string }[];
	};
	const entries = journal.entries.filter((entry) => entry.idx <= lastIndex);
	await writeFile(join(directory, "meta/_journal.json"), JSON.stringify({ ...journal, entries }));
	for (const entry of entries)
		await copyFile(join(migrations, `${entry.tag}.sql`), join(directory, `${entry.tag}.sql`));
}

async function tableNames(tx: Db) {
	const { rows } = await tx.$client.query<{ name: string }>(
		"SELECT tablename AS name FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
	);
	return rows.map((row) => row.name);
}

async function retainedRows(tx: Db) {
	return Promise.all(
		["projects", "statuses", "tickets", "actors"].map(
			async (table) =>
				(await tx.$client.query(`SELECT to_jsonb(t) AS row FROM "${table}" t ORDER BY to_jsonb(t)::text`)).rows,
		),
	);
}

test("the upgrade removes inbox state and preserves tickets, projects, statuses, and actors", async () => {
	const directory = await mkdtemp(join(tmpdir(), "trellis-needs-you-removal-"));
	const db = await openDb(":memory:");
	try {
		await mkdir(join(directory, "meta"));
		await writeHistory(directory, removalIndex - 1);
		await runMigrations(db, { migrationsFolder: directory });
		await db.$client.exec(`
			INSERT INTO projects (id,key,slug,name,created_at,updated_at)
			VALUES ('project','TEST','test','Project',now(),now());
			INSERT INTO statuses (id,project_id,name,slug,category,color,position,created_at,updated_at)
			VALUES ('status','project','Review','review','review','gray',0,now(),now());
			INSERT INTO tickets (id,project_id,number,title,status_id,position,created_at,updated_at)
			VALUES ('ticket','project',1,'Keep this ticket','status',0,now(),now());
			INSERT INTO actors (name,kind,first_seen_at,last_seen_at)
			VALUES ('reader','human',now(),now());
			INSERT INTO needs_you_states (actor_name,item_id,ticket_id,snoozed_until,ignored,updated_at)
			VALUES ('reader','active','ticket',NULL,false,now()),
				('reader','snoozed','ticket','2099-01-01',false,now()),
				('reader','ignored','ticket',NULL,true,now());
		`);
		const tables = await tableNames(db);
		const rows = await retainedRows(db);
		expect(tables).toContain("needs_you_states");
		expect((await db.$client.query("SELECT * FROM needs_you_states")).rows).toHaveLength(3);

		await writeHistory(directory, removalIndex);
		await runMigrations(db, { migrationsFolder: directory });
		expect(await tableNames(db)).toEqual(tables.filter((table) => table !== "needs_you_states"));
		expect(await retainedRows(db)).toEqual(rows);
		await runMigrations(db, { migrationsFolder: directory });
		expect(await retainedRows(db)).toEqual(rows);
	} finally {
		await db.$client.close();
		await rm(directory, { recursive: true });
	}
}, 60_000);

test("a fresh database omits inbox state and retains the ticket schema", async () => {
	const db = await openDb(":memory:");
	try {
		await migrate(db);
		const tables = await tableNames(db);
		expect(tables).not.toContain("needs_you_states");
		for (const table of ["tickets", "actors", "pull_requests", "review_threads"]) expect(tables).toContain(table);
		expect(await migrate(db)).toBe(0);
	} finally {
		await db.$client.close();
	}
}, 60_000);
