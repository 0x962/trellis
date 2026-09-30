import { copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate as runMigrations } from "drizzle-orm/pglite/migrator";
import type { Db } from "../client.ts";

const migrations = join(import.meta.dir, "../../../drizzle");
export async function historyDirectory() {
	const directory = await mkdtemp(join(tmpdir(), "trellis-readiness-upgrade-"));
	await mkdir(join(directory, "meta"));
	return directory;
}

export async function advance(db: Db, directory: string, through: number) {
	const journal = JSON.parse(await readFile(join(migrations, "meta/_journal.json"), "utf8")) as {
		entries: { idx: number; tag: string }[];
	};
	const entries = journal.entries.filter((entry) => entry.idx <= through);
	if (entries.at(-1)?.idx !== through) throw new Error(`Missing migration ${through}`);
	await writeFile(join(directory, "meta/_journal.json"), JSON.stringify({ ...journal, entries }));
	for (const entry of entries)
		await copyFile(join(migrations, `${entry.tag}.sql`), join(directory, `${entry.tag}.sql`));
	await runMigrations(db, { migrationsFolder: directory });
}

export async function retainedRows(db: Db) {
	const result: Record<string, unknown> = {};
	for (const table of ["pull_requests", "review_submissions", "review_deliveries", "actors", "activity"])
		result[table] = (
			await db.$client.query(`SELECT to_jsonb(t) AS row FROM "${table}" t ORDER BY to_jsonb(t)::text`)
		).rows;
	return result;
}

export async function insertPr(db: Db, id: string, number: number) {
	await db.$client.query(
		`INSERT INTO pull_requests (id, owner, repo, number, url, state, created_at, updated_at)
		VALUES ($1, 'upgrade', 'review', $2, $3, 'open', '2026-09-01', '2026-09-01')`,
		[id, number, `https://github.com/upgrade/review/pull/${number}`],
	);
}
