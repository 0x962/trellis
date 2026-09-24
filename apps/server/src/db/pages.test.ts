import { afterAll, beforeAll, expect, test } from "bun:test";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PAGE_COMMENT_ANCHOR_MAX_BYTES, PageCommentAnchorSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { migrate as runMigrations } from "drizzle-orm/pglite/migrator";
import { ulid } from "ulid";
import type { Db } from "./client.ts";
import { openDb } from "./client.ts";
import { openTestDb } from "./testDb.ts";

const at = new Date("2026-09-24T12:00:00.000Z");
const human = { name: "Test", kind: "human" } as const;
const agent = { name: "page-agent", kind: "agent" } as const;
const projectId = ulid();
const pageId = ulid();
const agentId = ulid();
const documentSha = "a".repeat(64);
const assetSha = "b".repeat(64);
const emptySha = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const maxAssetPath = Array.from({ length: 32 }, () => crypto.randomUUID().replaceAll("-", "")).join("");
let db: Db;

const constraint = async (statement: Promise<unknown>, name: string) => {
	await expect(statement).rejects.toThrow(name);
};

const insertVersion = (
	number: number,
	overrides?: { requestId?: string; sha?: string; size?: number; path?: string },
) =>
	db.execute(sql`INSERT INTO page_versions
		(page_id, number, request_id, document_sha256, document_size, search_text, source_agent_id, source_path,
		 actor_name, actor_kind, created_at)
		VALUES (${pageId}, ${number}, ${overrides?.requestId ?? crypto.randomUUID()},
			${overrides?.sha ?? documentSha}, ${overrides?.size ?? 100}, '', ${agentId},
			${overrides?.path ?? "pages/index.html"}, ${human.name}, ${human.kind}, ${at})`);

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO actors (name, kind, first_seen_at, last_seen_at)
		VALUES (${human.name}, ${human.kind}, ${at}, ${at}), (${agent.name}, ${agent.kind}, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
		VALUES (${projectId}, 'TST', 'test', 'Test', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO agent_runs
		(id, name, kind, instruction, project_id, project_key, created_at, updated_at)
		VALUES (${agentId}, 'page-agent', 'session', '', ${projectId}, 'TST', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO pages
		(id, project_id, slug, title, summary, version, latest_version,
		 creator_actor_name, creator_actor_kind, actor_name, actor_kind, created_at, updated_at)
		VALUES (${pageId}, ${projectId}, 'release-report', 'Release report', '', 1, 1,
			${human.name}, ${human.kind}, ${human.name}, ${human.kind}, ${at}, ${at})`);
	await insertVersion(1);
}, 30_000);

afterAll(async () => {
	await db.$client.close();
});

test("Page rows enforce stable project identity, revisions, actors, and soft delete state", async () => {
	await constraint(
		db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
			VALUES (${ulid()}, 'PGS', 'pages', 'Reserved Pages route', ${at}, ${at})`),
		"projects_slug_check",
	);
	await constraint(
		db.execute(sql`INSERT INTO pages
			(id, project_id, slug, title, creator_actor_name, creator_actor_kind, actor_name, actor_kind, created_at, updated_at)
			VALUES (${ulid()}, ${projectId}, 'release-report', 'Other', ${human.name}, ${human.kind},
				${human.name}, ${human.kind}, ${at}, ${at})`),
		"pages_project_id_slug_unique",
	);
	await constraint(db.execute(sql`UPDATE pages SET title = ' padded ' WHERE id = ${pageId}`), "pages_title_check");
	await constraint(
		db.execute(sql`UPDATE pages SET latest_version = 2 WHERE id = ${pageId}`),
		"pages_latest_version_check",
	);
	await constraint(db.execute(sql`UPDATE pages SET deleted_at = ${at} WHERE id = ${pageId}`), "pages_deleted_check");
	const row = await db.execute(
		sql`SELECT slug, title, version, latest_version, deleted_at FROM pages WHERE id = ${pageId}`,
	);
	expect(row.rows).toEqual([
		{ slug: "release-report", title: "Release report", version: 1, latest_version: 1, deleted_at: null },
	]);
});

test("Page versions enforce immutable request, document, source, and asset records", async () => {
	await constraint(
		insertVersion(2, { requestId: crypto.randomUUID(), sha: "bad" }),
		"page_versions_document_sha256_check",
	);
	await constraint(
		insertVersion(2, { requestId: crypto.randomUUID(), size: 16777217 }),
		"page_versions_document_size_check",
	);
	await constraint(
		insertVersion(2, { requestId: crypto.randomUUID(), path: "../outside.html" }),
		"page_versions_source_path_check",
	);
	await constraint(
		insertVersion(2, { requestId: crypto.randomUUID(), path: "C:/page.html" }),
		"page_versions_source_path_check",
	);
	await constraint(
		insertVersion(2, {
			requestId: (await db.execute(sql`SELECT request_id FROM page_versions`)).rows[0]!.request_id as string,
		}),
		"page_versions_request_id_unique",
	);

	await db.execute(sql`INSERT INTO page_assets (page_id, version, path, sha256, size, mime)
		VALUES (${pageId}, 1, 'styles/app.css', ${assetSha}, 100, 'text/css')`);
	await db.execute(sql`INSERT INTO page_assets (page_id, version, path, sha256, size, mime)
		VALUES (${pageId}, 1, 'empty.txt', ${emptySha}, 0, 'text/plain')`);
	await db.execute(sql`INSERT INTO page_assets (page_id, version, path, sha256, size, mime)
		VALUES (${pageId}, 1, ${maxAssetPath}, ${assetSha}, 100, 'text/css')`);
	for (const path of [
		"/root.js",
		"C:/file.js",
		"../root.js",
		"scripts\\run.js",
		"a//b.js",
		"a/./b.js",
		"index.html",
		".trellis/run.js",
		"control\u0085.js",
	]) {
		await constraint(
			db.execute(sql`INSERT INTO page_assets (page_id, version, path, sha256, size, mime)
				VALUES (${pageId}, 1, ${path}, ${assetSha}, 100, 'text/javascript')`),
			"page_assets_path_check",
		);
	}
	await constraint(
		db.execute(sql`INSERT INTO page_assets (page_id, version, path, sha256, size, mime)
			VALUES (${pageId}, 99, 'missing.css', ${assetSha}, 100, 'text/css')`),
		"page_assets_version_fk",
	);
	await constraint(
		db.execute(sql`INSERT INTO page_assets (page_id, version, path, sha256, size, mime)
			VALUES (${pageId}, 1, ${"a".repeat(1025)}, ${assetSha}, 100, 'text/css')`),
		"page_assets_path_check",
	);
	await constraint(
		db.execute(sql`INSERT INTO page_assets (page_id, version, path, sha256, size, mime)
			VALUES (${pageId}, 1, ${"界".repeat(400)}, ${assetSha}, 100, 'text/css')`),
		"page_assets_path_check",
	);
});

test("Page uploads, comments, watches, and pins enforce their row state", async () => {
	await db.execute(sql`INSERT INTO page_uploads
		(id, project_id, sha256, size, mime, original_name, actor_name, actor_kind, created_at, expires_at)
		VALUES (${ulid()}, ${projectId}, ${assetSha}, 100, 'text/css', 'app.css',
			${human.name}, ${human.kind}, ${at}, ${new Date(at.getTime() + 86_400_000)})`);
	await db.execute(sql`INSERT INTO page_uploads
		(id, project_id, sha256, size, mime, original_name, actor_name, actor_kind, created_at, expires_at)
		VALUES (${ulid()}, ${projectId}, ${emptySha}, 0, 'text/plain', 'empty.txt',
			${human.name}, ${human.kind}, ${at}, ${new Date(at.getTime() + 86_400_000)})`);
	await constraint(
		db.execute(sql`INSERT INTO page_uploads
			(id, project_id, sha256, size, mime, original_name, actor_name, actor_kind, created_at, expires_at)
			VALUES (${ulid()}, ${projectId}, ${assetSha}, 100, 'text/css', 'app.css',
				${human.name}, ${human.kind}, ${at}, ${at})`),
		"page_uploads_expiry_check",
	);

	const threadId = ulid();
	const maxAnchor = {
		kind: "text" as const,
		path: "界".repeat(4000),
		quote: "界".repeat(1438),
		prefix: "a",
		suffix: "",
	};
	expect(PageCommentAnchorSchema.safeParse(maxAnchor).success).toBe(true);
	expect((await db.execute(sql`SELECT octet_length(${maxAnchor}::jsonb::text) AS size`)).rows).toEqual([
		{ size: PAGE_COMMENT_ANCHOR_MAX_BYTES },
	]);
	await db.execute(sql`INSERT INTO page_comment_threads
		(id, page_id, version, anchor_kind, anchor, selected_text, actor_name, actor_kind, created_at, updated_at)
		VALUES (${threadId}, ${pageId}, 1, 'text', ${{ kind: "text", path: "body/p[1]", quote: "Result", prefix: "", suffix: "" }}::jsonb,
			'Result', ${human.name}, ${human.kind}, ${at}, ${at})`);
	await constraint(
		db.execute(sql`INSERT INTO page_comment_threads
			(id, page_id, version, anchor_kind, anchor, selected_text, actor_name, actor_kind, created_at, updated_at)
			VALUES (${ulid()}, ${pageId}, 1, 'element', ${{ kind: "element", path: "body" }}::jsonb,
				'Result', ${human.name}, ${human.kind}, ${at}, ${at})`),
		"page_comment_threads_selected_text_check",
	);
	await constraint(
		db.execute(sql`INSERT INTO page_comment_threads
			(id, page_id, version, anchor_kind, anchor, selected_text, actor_name, actor_kind, created_at, updated_at)
			VALUES (${ulid()}, ${pageId}, 1, 'text', ${{ kind: "text", path: "body", quote: "Result", prefix: "", suffix: "" }}::jsonb,
				NULL, ${human.name}, ${human.kind}, ${at}, ${at})`),
		"page_comment_threads_selected_text_check",
	);
	await constraint(
		db.execute(sql`INSERT INTO page_comment_threads
			(id, page_id, version, anchor_kind, anchor, selected_text, actor_name, actor_kind, created_at, updated_at)
			VALUES (${ulid()}, ${pageId}, 1, 'text', ${{ kind: "element", path: "body" }}::jsonb,
				'Result', ${human.name}, ${human.kind}, ${at}, ${at})`),
		"page_comment_threads_anchor_check",
	);
	await constraint(
		db.execute(sql`INSERT INTO page_comment_threads
			(id, page_id, version, anchor_kind, anchor, selected_text, actor_name, actor_kind, created_at, updated_at)
			VALUES (${ulid()}, ${pageId}, 1, 'text', ${{ path: "body" }}::jsonb,
				'Result', ${human.name}, ${human.kind}, ${at}, ${at})`),
		"page_comment_threads_anchor_check",
	);
	await db.execute(sql`INSERT INTO page_comments
		(id, thread_id, body, actor_name, actor_kind, created_at, updated_at)
		VALUES (${ulid()}, ${threadId}, 'Change this result.', ${human.name}, ${human.kind}, ${at}, ${at})`);
	await constraint(
		db.execute(sql`INSERT INTO page_comments
			(id, thread_id, body, actor_name, actor_kind, created_at, updated_at)
			VALUES (${ulid()}, ${threadId}, ${"x".repeat(10001)}, ${human.name}, ${human.kind}, ${at}, ${at})`),
		"page_comments_body_check",
	);

	await db.execute(sql`INSERT INTO page_watches (page_id, agent_id, created_at, updated_at)
		VALUES (${pageId}, ${agentId}, ${at}, ${at})`);
	await constraint(
		db.execute(sql`UPDATE page_watches SET cursor_at = ${at} WHERE page_id = ${pageId}`),
		"page_watches_cursor_check",
	);
	const reservationId = ulid();
	const reservationExpiresAt = new Date(at.getTime() + 60_000);
	const reservationEndAt = new Date(at.getTime() + 30_000);
	const reservationEndId = ulid();
	for (let mask = 1; mask < 15; mask += 1) {
		await constraint(
			db.execute(sql`UPDATE page_watches SET
				reservation_id = ${(mask & 1) !== 0 ? reservationId : null},
				reservation_expires_at = ${(mask & 2) !== 0 ? reservationExpiresAt : null},
				reservation_end_at = ${(mask & 4) !== 0 ? reservationEndAt : null},
				reservation_end_id = ${(mask & 8) !== 0 ? reservationEndId : null}
				WHERE page_id = ${pageId}`),
			"page_watches_reservation_check",
		);
	}
	await db.execute(sql`UPDATE page_watches SET
		reservation_id = ${reservationId}, reservation_expires_at = ${reservationExpiresAt},
		reservation_end_at = ${reservationEndAt}, reservation_end_id = ${reservationEndId}
		WHERE page_id = ${pageId}`);
	const reserved = await db.execute(
		sql`SELECT reservation_id, reservation_end_id FROM page_watches WHERE page_id = ${pageId}`,
	);
	expect(reserved.rows).toEqual([{ reservation_id: reservationId, reservation_end_id: reservationEndId }]);
	await db.execute(sql`INSERT INTO page_pins (page_id, actor_name, actor_kind, created_at)
		VALUES (${pageId}, ${human.name}, ${human.kind}, ${at})`);
	await constraint(
		db.execute(sql`INSERT INTO page_pins (page_id, actor_name, actor_kind, created_at)
			VALUES (${pageId}, ${human.name}, ${human.kind}, ${at})`),
		"page_pins_pkey",
	);
});

test("migration 0116 refuses a project that already uses the Pages route", async () => {
	const source = join(import.meta.dir, "../../drizzle");
	const root = await mkdtemp(join(tmpdir(), "trellis-pages-migration-"));
	const before = join(root, "drizzle");
	const journal = JSON.parse(await readFile(join(source, "meta/_journal.json"), "utf8")) as {
		entries: Array<{ tag: string }>;
	};
	const entries = journal.entries.filter((entry) => entry.tag !== "0116_pages");
	await mkdir(join(before, "meta"), { recursive: true });
	for (const entry of entries) await copyFile(join(source, `${entry.tag}.sql`), join(before, `${entry.tag}.sql`));
	await writeFile(join(before, "meta/_journal.json"), `${JSON.stringify({ ...journal, entries }, null, 2)}\n`);
	const migrationDb = await openDb(":memory:");
	try {
		await runMigrations(migrationDb, { migrationsFolder: before });
		const existing = ulid();
		await migrationDb.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
			VALUES (${existing}, 'PGS', 'pages', 'Existing pages project', ${at}, ${at})`);
		await expect(runMigrations(migrationDb, { migrationsFolder: source })).rejects.toThrow(
			'Cannot add Pages because project PGS ("Existing pages project") uses the reserved slug "pages".',
		);
		const row = await migrationDb.execute(sql`SELECT id, slug FROM projects WHERE id = ${existing}`);
		const tables = await migrationDb.execute(sql`SELECT to_regclass('pages') AS pages`);
		expect(row.rows).toEqual([{ id: existing, slug: "pages" }]);
		expect(tables.rows).toEqual([{ pages: null }]);
	} finally {
		await migrationDb.$client.close();
		await rm(root, { recursive: true, force: true });
	}
}, 30_000);
