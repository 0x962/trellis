import { copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate as runMigrations } from "drizzle-orm/pglite/migrator";
import { type Db, openDb } from "../client.ts";

const migrations = join(import.meta.dir, "../../../drizzle");

// The last migration before 0152_hosts, and the snapshot that names the
// columns a database held before the hosts upgrade.
const PRIOR_INDEX = 151;
const HOSTS_INDEX = 152;

export async function priorSnapshot() {
	return JSON.parse(await readFile(join(migrations, "meta/0151_snapshot.json"), "utf8")) as {
		tables: Record<string, { columns: Record<string, { name: string }> }>;
	};
}

// A copy of the migration folder that ends at `lastIndex`. Drizzle runs a
// `.sql` file only when the journal names it, so the truncated journal is
// the whole mechanism.
async function writeHistory(directory: string, lastIndex: number) {
	const journal = JSON.parse(await readFile(join(migrations, "meta/_journal.json"), "utf8")) as {
		entries: { idx: number; tag: string }[];
	};
	const entries = journal.entries.filter((entry) => entry.idx <= lastIndex);
	await writeFile(join(directory, "meta/_journal.json"), JSON.stringify({ ...journal, entries }));
	for (const entry of entries)
		await copyFile(join(migrations, `${entry.tag}.sql`), join(directory, `${entry.tag}.sql`));
}

export async function openPriorDatabase() {
	const directory = await mkdtemp(join(tmpdir(), "trellis-hosts-upgrade-"));
	await mkdir(join(directory, "meta"));
	await writeHistory(directory, PRIOR_INDEX);
	const db = await openDb(":memory:");
	await runMigrations(db, { migrationsFolder: directory });
	return { db, directory };
}

// Applies 0152_hosts to a prior database and returns how many migrations ran.
export async function migrateHostsUpgrade(db: Db, directory: string) {
	await writeHistory(directory, HOSTS_INDEX);
	const count = async () =>
		(await db.$client.query<{ count: number }>("SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations"))
			.rows[0]!.count;
	const before = await count();
	await runMigrations(db, { migrationsFolder: directory });
	return (await count()) - before;
}

// Every row of each table, projected onto the columns the prior snapshot
// names, so a comparison before and after the upgrade ignores the new
// columns and sees every old value.
export async function originalRows(db: Db, tables: string[]) {
	const snapshot = await priorSnapshot();
	const rows: Record<string, unknown> = {};
	for (const table of tables) {
		const columns = Object.keys(snapshot.tables[`public.${table}`]!.columns)
			.map((name) => `"${name}"`)
			.join(",");
		rows[table] = (
			await db.$client.query(
				`SELECT to_jsonb(t) AS row FROM (SELECT ${columns} FROM "${table}") t ORDER BY to_jsonb(t)::text`,
			)
		).rows;
	}
	return rows;
}
