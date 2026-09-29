import { afterAll, expect, test } from "bun:test";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { migrate as runMigrations } from "drizzle-orm/pglite/migrator";
import { ulid } from "ulid";
import { openDb } from "./client.ts";
import { migrate } from "./migrate.ts";

const migrationsDir = join(import.meta.dir, "../../drizzle");
const journal = JSON.parse(await readFile(join(migrationsDir, "meta/_journal.json"), "utf8")) as {
	version: string;
	dialect: string;
	entries: { idx: number; tag: string; when: number; version: string; breakpoints: boolean }[];
};
const fixturesDir = await mkdtemp(join(tmpdir(), "trellis-note-body-migration-"));
let db: Awaited<ReturnType<typeof openDb>>;

afterAll(async () => {
	await db.$client.close();
	await rm(fixturesDir, { recursive: true });
});

test("the forward migration preserves existing notes and accepts complete multibyte bodies", async () => {
	const earlierEntries = journal.entries.filter((entry) => entry.idx <= 134);
	await mkdir(join(fixturesDir, "meta"));
	await writeFile(join(fixturesDir, "meta/_journal.json"), JSON.stringify({ ...journal, entries: earlierEntries }));
	for (const entry of earlierEntries)
		await copyFile(join(migrationsDir, `${entry.tag}.sql`), join(fixturesDir, `${entry.tag}.sql`));
	db = await openDb(":memory:");
	await runMigrations(db, { migrationsFolder: fixturesDir });
	const projectId = ulid();
	const noteId = ulid();
	const at = "2026-09-29T20:00:00.000Z";
	const original = "界".repeat(4000);
	const body = "漢字 café 𐐷\n".repeat(2000).trim();
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
		VALUES (${projectId}, 'TST', 'test', 'Test', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO actors (name, kind, first_seen_at, last_seen_at)
		VALUES ('Note author', 'human', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO notes
		(id, project_id, title, body, audience, expires_at, actor_name, actor_kind, created_at, updated_at)
		VALUES (${noteId}, ${projectId}, 'Existing note', ${original}, 'worker', NULL, 'Note author', 'human', ${at}, ${at})`);
	const before = (await db.execute(sql`SELECT * FROM notes WHERE id = ${noteId}`)).rows;
	await expect(db.execute(sql`UPDATE notes SET body = ${body} WHERE id = ${noteId}`)).rejects.toThrow(
		"notes_body_check",
	);
	expect(await migrate(db)).toBeGreaterThan(0);
	expect((await db.execute(sql`SELECT * FROM notes WHERE id = ${noteId}`)).rows).toEqual(before);
	await db.execute(sql`UPDATE notes SET body = ${body} WHERE id = ${noteId}`);
	expect((await db.execute(sql`SELECT body FROM notes WHERE id = ${noteId}`)).rows).toEqual([{ body }]);
	await expect(db.execute(sql`UPDATE notes SET body = '' WHERE id = ${noteId}`)).rejects.toThrow("notes_body_check");
}, 60_000);
