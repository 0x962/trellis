import { copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate as runMigrations } from "drizzle-orm/pglite/migrator";
import { type Db, openDb } from "../client.ts";

const migrations = join(import.meta.dir, "../../../drizzle");
type HistoricalTable = {
	name: string;
	columns: Record<string, { notNull: boolean }>;
	foreignKeys: Record<string, { name: string; tableTo: string; columnsFrom: string[] }>;
};

export async function priorSnapshot() {
	return JSON.parse(await readFile(join(migrations, "meta/0138_snapshot.json"), "utf8")) as {
		tables: Record<string, HistoricalTable>;
	};
}

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
	const directory = await mkdtemp(join(tmpdir(), "trellis-actor-upgrade-"));
	await mkdir(join(directory, "meta"));
	await writeHistory(directory, 138);
	const db = await openDb(":memory:");
	await runMigrations(db, { migrationsFolder: directory });
	return { db, directory };
}

export async function migrateActorUpgrade(db: Db, directory: string) {
	await writeHistory(directory, 139);
	const count = async () =>
		(await db.$client.query<{ count: number }>("SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations"))
			.rows[0]!.count;
	const before = await count();
	await runMigrations(db, { migrationsFolder: directory });
	return (await count()) - before;
}

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

export async function actorRoles() {
	const snapshot = await priorSnapshot();
	return Object.values(snapshot.tables).flatMap((table) =>
		Object.values(table.foreignKeys)
			.filter((key) => key.tableTo === "actors")
			.map((key) => ({
				table: table.name,
				constraint: key.name,
				name: key.columnsFrom[0]!,
				kind: key.columnsFrom[1]!,
				id: key.columnsFrom[0]!.replace(/name$/, "id"),
				required: table.columns[key.columnsFrom[0]!]!.notNull,
			})),
	);
}

export async function foreignKeys(db: Db) {
	return (
		await db.$client.query<{ name: string; table: string; target: string; definition: string }>(`
		SELECT conname AS name, conrelid::regclass::text AS table,
		confrelid::regclass::text AS target, pg_get_constraintdef(oid) AS definition
		FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace
		ORDER BY conrelid::regclass::text,conname
	`)
	).rows;
}
