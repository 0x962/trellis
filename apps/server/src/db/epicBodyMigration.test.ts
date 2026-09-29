import { afterAll, expect, test } from "bun:test";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { migrate as runMigrations } from "drizzle-orm/pglite/migrator";
import { type Db, openDb } from "./client.ts";
import { migrate } from "./migrate.ts";

const migrationsDir = join(import.meta.dir, "../../drizzle");
let db: Db;
let fixtureDir: string;

afterAll(async () => {
	await db?.$client.close();
	if (fixtureDir) await rm(fixtureDir, { recursive: true });
});

test("the forward migration preserves epic plans and document bodies", async () => {
	const journal = JSON.parse(await readFile(join(migrationsDir, "meta/_journal.json"), "utf8")) as {
		entries: { idx: number; tag: string }[];
	};
	const earlierEntries = journal.entries.filter((entry) => entry.idx <= 134);
	fixtureDir = await mkdtemp(join(tmpdir(), "trellis-epic-body-migration-"));
	await mkdir(join(fixtureDir, "meta"));
	await writeFile(join(fixtureDir, "meta/_journal.json"), JSON.stringify({ ...journal, entries: earlierEntries }));
	for (const entry of earlierEntries)
		await copyFile(join(migrationsDir, `${entry.tag}.sql`), join(fixtureDir, `${entry.tag}.sql`));
	db = await openDb(":memory:");
	await runMigrations(db, { migrationsFolder: fixtureDir });
	const original = `  # Plan\n${"文é𝄞\n".repeat(30_000)}tail  `;
	const complete = `  # Complete\n${"文é𝄞\n".repeat(60_000)}tail  `;
	const at = "2026-09-29T20:00:00.000Z";
	await db.execute(sql`INSERT INTO actors (name, kind, first_seen_at, last_seen_at)
		VALUES ('body-test', 'human', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
		VALUES ('body-project', 'BD', 'body-project', 'Body project', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO epics
		(id, project_id, slug, name, description, actor_name, actor_kind, created_at, updated_at)
		VALUES ('body-epic', 'body-project', 'body-epic', 'Body epic', ${original}, 'body-test', 'human', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO epic_resources
		(id, epic_id, kind, name, body, actor_name, actor_kind, created_at, updated_at)
		VALUES ('body-resource', 'body-epic', 'doc', 'Body document', ${original}, 'body-test', 'human', ${at}, ${at})`);
	const epicRow = sql`SELECT id, project_id, slug, name, description, actor_name, actor_kind, created_at, updated_at
		FROM epics WHERE id='body-epic'`;
	const resourceRow = sql`SELECT id, epic_id, kind, name, body, url, blob_sha256, blob_size, mime, ticket_id,
		actor_name, actor_kind, created_at, updated_at FROM epic_resources WHERE id='body-resource'`;
	const epicBefore = (await db.execute(epicRow)).rows;
	const resourceBefore = (await db.execute(resourceRow)).rows;
	await expect(db.execute(sql`UPDATE epics SET description=${complete} WHERE id='body-epic'`)).rejects.toThrow(
		"epics_description_check",
	);
	await expect(db.execute(sql`UPDATE epic_resources SET body=${complete} WHERE id='body-resource'`)).rejects.toThrow(
		"epic_resources_body_check",
	);

	expect(await migrate(db)).toBeGreaterThan(0);
	expect((await db.execute(epicRow)).rows).toEqual(epicBefore);
	expect((await db.execute(resourceRow)).rows).toEqual(resourceBefore);
	await db.execute(sql`UPDATE epics SET description=${complete} WHERE id='body-epic'`);
	await db.execute(sql`UPDATE epic_resources SET body=${complete} WHERE id='body-resource'`);
	expect((await db.execute(sql`SELECT description FROM epics WHERE id='body-epic'`)).rows).toEqual([
		{ description: complete },
	]);
	expect((await db.execute(sql`SELECT body FROM epic_resources WHERE id='body-resource'`)).rows).toEqual([
		{ body: complete },
	]);
	await expect(db.execute(sql`UPDATE epic_resources SET body=NULL WHERE id='body-resource'`)).rejects.toThrow(
		"epic_resources_value_check",
	);
	expect(await migrate(db)).toBe(0);
}, 60_000);
