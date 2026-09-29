import { afterAll, expect, test } from "bun:test";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate as runMigrations } from "drizzle-orm/pglite/migrator";
import { type Db, openDb } from "../client";
import { migrate } from "../migrate";
import { cases, type LimitCase } from "./cases";
import { seed } from "./seed";

const migrations = join(import.meta.dir, "../../../drizzle");
const scratch: string[] = [];
let db: Db;
afterAll(async () => {
	await db?.$client.close();
	for (const directory of scratch) await rm(directory, { recursive: true, force: true });
});

const update = (entry: LimitCase, value: unknown) =>
	db.$client.query(`UPDATE "${entry.table}" SET "${entry.column}"=$1 WHERE ${entry.where ?? "true"}`, [
		typeof value === "object" && value !== null ? JSON.stringify(value) : value,
	]);

async function retainedRows(tables: string[]) {
	const result: Record<string, unknown> = {};
	for (const table of tables) {
		result[table] = (
			await db.$client.query(`SELECT to_jsonb(t) AS row FROM "${table}" t ORDER BY to_jsonb(t)::text`)
		).rows;
	}
	return result;
}

async function constraints() {
	return (
		await db.$client.query<{ table: string; name: string; type: string; definition: string }>(`
		SELECT conrelid::regclass::text AS table, conname AS name, contype AS type, pg_get_constraintdef(oid) AS definition
		FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY conrelid::regclass::text, conname
	`)
	).rows;
}

test("0138 preserves the preceding database and removes only the specified text ceilings", async () => {
	const journal = JSON.parse(await readFile(join(migrations, "meta/_journal.json"), "utf8")) as {
		entries: { idx: number; tag: string }[];
	};
	const prior = journal.entries.filter((entry) => entry.idx < 138);
	expect(prior.at(-1)!.idx).toBe(137);
	const directory = await mkdtemp(join(tmpdir(), "trellis-limit-upgrade-"));
	scratch.push(directory);
	await mkdir(join(directory, "meta"));
	await writeFile(join(directory, "meta/_journal.json"), JSON.stringify({ ...journal, entries: prior }));
	for (const entry of prior) await copyFile(join(migrations, `${entry.tag}.sql`), join(directory, `${entry.tag}.sql`));
	db = await openDb(":memory:");
	await runMigrations(db, { migrationsFolder: directory });
	const tables = await seed(db);
	const before = await retainedRows(tables);
	const beforeConstraints = await constraints();
	for (const entry of cases) {
		await expect(
			update(entry, entry.value),
			`${entry.table}.${entry.column} retains its prior ceiling`,
		).rejects.toMatchObject({ code: "23514" });
	}
	expect(await retainedRows(tables)).toEqual(before);
	expect(await migrate(db)).toBe(1);
	expect(await retainedRows(tables)).toEqual(before);
	const afterConstraints = await constraints();
	for (const constraint of beforeConstraints.filter((row) => row.type === "f")) {
		expect(afterConstraints.find((row) => row.table === constraint.table && row.name === constraint.name)).toEqual(
			constraint,
		);
	}
	for (const entry of cases) {
		await update(entry, entry.value);
		const value = (
			await db.$client.query<{ value: unknown }>(
				`SELECT "${entry.column}" AS value FROM "${entry.table}" WHERE ${entry.where ?? "true"}`,
			)
		).rows[0]!.value;
		expect(value, `${entry.table}.${entry.column} retains the complete value`).toEqual(entry.value);
		for (const invalid of entry.invalid)
			await expect(
				update(entry, invalid),
				`${entry.table}.${entry.column} rejects invalid content`,
			).rejects.toMatchObject({ code: "23514" });
	}
	await expect(db.$client.query("UPDATE tickets SET status_id='missing'")).rejects.toMatchObject({ code: "23503" });
	await expect(db.$client.query("UPDATE waves SET position=-1")).rejects.toMatchObject({ code: "23514" });
	await expect(db.$client.query("UPDATE page_assets SET path='../escape'")).rejects.toMatchObject({ code: "23514" });
	await expect(db.$client.query("UPDATE page_assets SET path=$1", ["x".repeat(1025)])).rejects.toMatchObject({
		code: "23514",
	});
	await expect(db.$client.query("UPDATE page_assets SET sha256='bad'")).rejects.toMatchObject({ code: "23514" });
	await expect(db.$client.query("UPDATE page_assets SET size=-1")).rejects.toMatchObject({ code: "23514" });
	await expect(db.$client.query("UPDATE resource_comments SET prefix=$1", ["x".repeat(33)])).rejects.toMatchObject({
		code: "23514",
	});
	await expect(db.$client.query("UPDATE page_comment_threads SET resolved_at=now()")).rejects.toMatchObject({
		code: "23514",
	});
	await expect(db.$client.query("UPDATE statuses SET category='invalid'")).rejects.toMatchObject({ code: "23514" });
	await expect(db.$client.query("UPDATE providers SET kind='invalid'")).rejects.toMatchObject({ code: "23514" });
	await expect(db.$client.query("UPDATE labels SET color='invalid'")).rejects.toMatchObject({ code: "23514" });
	const saved = await retainedRows(tables);
	const archive = await db.$client.dumpDataDir();
	await db.$client.close();
	db = await openDb(":memory:", archive);
	expect(await migrate(db)).toBe(0);
	expect(await retainedRows(tables)).toEqual(saved);
}, 120_000);
