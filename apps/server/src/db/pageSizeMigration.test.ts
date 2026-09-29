import { afterAll, expect, test } from "bun:test";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PageAssetSchema, PageUploadSchema, PageVersionSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { migrate as runMigrations } from "drizzle-orm/pglite/migrator";
import { ulid } from "ulid";
import { type Db, openDb } from "./client.ts";
import { migrate } from "./migrate.ts";

const migrationsDir = join(import.meta.dir, "../../drizzle");
const journal = JSON.parse(await readFile(join(migrationsDir, "meta/_journal.json"), "utf8")) as {
	version: string;
	dialect: string;
	entries: { idx: number; tag: string; when: number; version: string; breakpoints: boolean }[];
};
const fixturesDir = await mkdtemp(join(tmpdir(), "trellis-page-size-migration-"));
const databases: Db[] = [];

afterAll(async () => {
	for (const db of databases) await db.$client.close();
	await rm(fixturesDir, { recursive: true });
});

test("migration 0129 preserves published versions and removes their size ceilings", async () => {
	const earlierEntries = journal.entries.filter((entry) => entry.idx < 129);
	await mkdir(join(fixturesDir, "meta"));
	await writeFile(join(fixturesDir, "meta/_journal.json"), JSON.stringify({ ...journal, entries: earlierEntries }));
	for (const entry of earlierEntries) {
		await copyFile(join(migrationsDir, `${entry.tag}.sql`), join(fixturesDir, `${entry.tag}.sql`));
	}
	const db = await openDb(":memory:");
	databases.push(db);
	await runMigrations(db, { migrationsFolder: fixturesDir });
	const projectId = ulid();
	const pageId = ulid();
	const actor = { name: "Navid", kind: "human" as const };
	const createdAt = new Date("2026-09-29T06:00:00.000Z");
	const requestId = crypto.randomUUID();
	const sha256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
	const truncatedSearchText = "x".repeat(1024 * 1024 - 3);
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
		VALUES (${projectId}, 'PAG', 'pages-test', 'Pages test', ${createdAt}, ${createdAt})`);
	await db.execute(sql`INSERT INTO actors (name, kind, first_seen_at, last_seen_at)
		VALUES (${actor.name}, ${actor.kind}, ${createdAt}, ${createdAt})`);
	await db.execute(sql`INSERT INTO pages (
		id, project_id, slug, title, summary, version, latest_version,
		creator_actor_name, creator_actor_kind, actor_name, actor_kind, created_at, updated_at
	) VALUES (
		${pageId}, ${projectId}, 'report', 'Report', '', 1, 1,
		${actor.name}, ${actor.kind}, ${actor.name}, ${actor.kind}, ${createdAt}, ${createdAt}
	)`);
	await db.execute(sql`INSERT INTO page_versions (
		page_id, number, request_id, document_sha256, document_size,
		search_text, search_indexed, source_path, actor_name, actor_kind, created_at
	) VALUES (
		${pageId}, 1, ${requestId}, ${sha256}, 1,
		${truncatedSearchText}, true, 'index.html', ${actor.name}, ${actor.kind}, ${createdAt}
	)`);

	expect(await migrate(db)).toBe(journal.entries.length - earlierEntries.length);
	const existing = await db.execute(sql`SELECT request_id, document_size,
		octet_length(search_text)::int AS search_size, search_indexed
		FROM page_versions
		WHERE page_id = ${pageId} AND number = 1`);
	expect(existing.rows).toEqual([
		{ request_id: requestId, document_size: 1, search_size: 1024 * 1024 - 3, search_indexed: false },
	]);

	const documentSize = 16 * 1024 * 1024 + 1;
	const assetSize = 100 * 1024 * 1024 + 1;
	const searchText = "x".repeat(1024 * 1024 + 1);
	const uploadId = ulid();
	await db.execute(sql`INSERT INTO page_versions (
		page_id, number, request_id, document_sha256, document_size,
		search_text, search_indexed, source_path, actor_name, actor_kind, created_at, actor_id
	) VALUES (
		${pageId}, 2, ${crypto.randomUUID()}, ${sha256}, ${documentSize},
		${searchText}, true, 'index.html', ${actor.name}, ${actor.kind}, ${createdAt},
		(SELECT id FROM actors WHERE ARRAY[kind, name] = ARRAY[${actor.kind}, ${actor.name}]::text[]))`);
	await db.execute(sql`INSERT INTO page_assets (page_id, version, path, sha256, size, mime)
		VALUES (${pageId}, 2, 'large.bin', ${sha256}, ${assetSize}, 'application/octet-stream')`);
	await db.execute(sql`INSERT INTO page_uploads (
		id, project_id, sha256, size, mime, original_name,
		actor_name, actor_kind, created_at, expires_at, actor_id
	) VALUES (
		${uploadId}, ${projectId}, ${sha256}, ${assetSize}, 'application/octet-stream', 'large.bin',
		${actor.name}, ${actor.kind}, ${createdAt}, ${new Date(createdAt.getTime() + 60_000)},
		(SELECT id FROM actors WHERE ARRAY[kind, name] = ARRAY[${actor.kind}, ${actor.name}]::text[]))`);

	expect(
		PageVersionSchema.shape.documentSize.parse(
			(await db.execute(sql`SELECT document_size FROM page_versions WHERE page_id = ${pageId} AND number = 2`)).rows[0]!
				.document_size,
		),
	).toBe(documentSize);
	expect(
		PageAssetSchema.shape.size.parse(
			(await db.execute(sql`SELECT size FROM page_assets WHERE page_id = ${pageId} AND version = 2`)).rows[0]!.size,
		),
	).toBe(assetSize);
	expect(
		PageUploadSchema.shape.size.parse(
			(await db.execute(sql`SELECT size FROM page_uploads WHERE id = ${uploadId}`)).rows[0]!.size,
		),
	).toBe(assetSize);
	expect(
		(
			await db.execute(sql`SELECT octet_length(search_text)::int AS size FROM page_versions
			WHERE page_id = ${pageId} AND number = 2`)
		).rows,
	).toEqual([{ size: 1024 * 1024 + 1 }]);
}, 60_000);
