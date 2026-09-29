import { expect, test } from "bun:test";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AttachmentSchema, PageDetailSchema, PageUploadSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { migrate as runMigrations } from "drizzle-orm/pglite/migrator";
import { ulid } from "ulid";
import type { ServiceCtx } from "../context.ts";
import { get, list, update } from "../services/pages/pages.ts";
import { createCache } from "./cache.ts";
import { openDb } from "./client.ts";
import { migrate } from "./migrate.ts";

test("metadata migration retains old rows and complete long metadata", async () => {
	const source = join(import.meta.dir, "../../drizzle");
	const journal = JSON.parse(await readFile(join(source, "meta/_journal.json"), "utf8")) as {
		entries: Array<{ tag: string }>;
	};
	const boundary = journal.entries.findIndex((entry) => entry.tag.startsWith("0138_"));
	expect(boundary).toBeGreaterThan(0);
	const entries = journal.entries.slice(0, boundary);
	const directory = await mkdtemp(join(tmpdir(), "trellis-page-metadata-"));
	const db = await openDb(":memory:");
	const at = new Date("2026-09-29T20:00:00.000Z");
	const projectId = ulid();
	const pageId = ulid();
	const ticketId = ulid();
	const attachmentId = ulid();
	const uploadId = ulid();
	const actor = { name: "Metadata", kind: "human" as const };
	const sha = "a".repeat(64);
	const cache = createCache();
	const ctx: ServiceCtx = {
		actor,
		session: null,
		reqId: ulid(),
		now: at,
		emit: () => {},
		cache,
		actorCache: new Map(),
		dropBlobs: () => {},
		publicUrl: "http://trellis.test",
	};
	try {
		await mkdir(join(directory, "meta"));
		await writeFile(join(directory, "meta/_journal.json"), JSON.stringify({ ...journal, entries }));
		for (const entry of entries) await copyFile(join(source, `${entry.tag}.sql`), join(directory, `${entry.tag}.sql`));
		await runMigrations(db, { migrationsFolder: directory });
		await db.execute(sql`INSERT INTO actors (name, kind, first_seen_at, last_seen_at)
			VALUES (${actor.name}, ${actor.kind}, ${at}, ${at})`);
		await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
			VALUES (${projectId}, 'META', 'metadata', 'Metadata', ${at}, ${at})`);
		const statusId = ulid();
		await db.execute(sql`INSERT INTO statuses
			(id, project_id, name, slug, category, color, position, is_default, created_at, updated_at)
			VALUES (${statusId}, ${projectId}, 'Todo', 'todo', 'todo', 'fg-muted', 0, true, ${at}, ${at})`);
		await db.execute(sql`INSERT INTO tickets (id, project_id, number, title, status_id, position, created_at, updated_at)
			VALUES (${ticketId}, ${projectId}, 1, 'Metadata', ${statusId}, 0, ${at}, ${at})`);
		await db.execute(sql`INSERT INTO pages
			(id, project_id, slug, title, summary, creator_actor_name, creator_actor_kind,
			actor_name, actor_kind, created_at, updated_at)
			VALUES (${pageId}, ${projectId}, 'report', 'Report', 'Summary', ${actor.name}, ${actor.kind},
			${actor.name}, ${actor.kind}, ${at}, ${at})`);
		await db.execute(sql`INSERT INTO page_versions
			(page_id, number, request_id, label, document_sha256, document_size, source_path, actor_name, actor_kind, created_at)
			VALUES (${pageId}, 1, ${crypto.randomUUID()}, 'Draft', ${sha}, 1, 'index.html', ${actor.name}, ${actor.kind}, ${at})`);
		const original = (await db.execute(sql`SELECT * FROM pages WHERE id = ${pageId}`)).rows;
		await migrate(db);
		expect((await db.execute(sql`SELECT * FROM pages WHERE id = ${pageId}`)).rows).toEqual(original);
		await db.transaction(cache.rebuild);

		const title = Array.from({ length: 300 }, () => crypto.randomUUID().replaceAll("-", "")).join("");
		const summary = "Summary ".repeat(400).trim();
		const label = "Label ".repeat(100).trim();
		const sourcePath = `${"directory/".repeat(500)}index.html`;
		const filename = `${"界".repeat(256)}.txt`;
		const mime = `application/${"x".repeat(300)}`;
		await db.transaction((tx) => update(ctx, tx, { page: pageId, title, summary, expectedVersion: 1 }));
		await db.execute(sql`UPDATE pages SET slug = ${title} WHERE id = ${pageId}`);
		await db.execute(
			sql`UPDATE page_versions SET label = ${label}, source_path = ${sourcePath} WHERE page_id = ${pageId}`,
		);
		const detail = PageDetailSchema.parse(await db.transaction((tx) => get(ctx, tx, { page: pageId })));
		expect(detail).toMatchObject({ title, summary, requestedVersion: { label, sourcePath } });
		expect(detail.ref).toBe(`META/pages/${title}`);
		const found = await db.transaction((tx) => list(ctx, tx, { project: projectId, q: summary }));
		expect(found.items.map((page) => page.id)).toEqual([pageId]);
		await expect(
			db.execute(sql`INSERT INTO pages
			(id, project_id, slug, title, creator_actor_name, creator_actor_kind, actor_name, actor_kind, created_at, updated_at)
			VALUES (${ulid()}, ${projectId}, ${title}, 'Duplicate', ${actor.name}, ${actor.kind},
			${actor.name}, ${actor.kind}, ${at}, ${at})`),
		).rejects.toThrow("pages_project_id_slug_unique");
		const otherProjectId = ulid();
		await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
			VALUES (${otherProjectId}, 'OTHER', 'other', 'Other', ${at}, ${at})`);
		await db.execute(sql`INSERT INTO pages
			(id, project_id, slug, title, creator_actor_name, creator_actor_kind, actor_name, actor_kind, created_at, updated_at)
			VALUES (${ulid()}, ${otherProjectId}, ${title}, 'Other project', ${actor.name}, ${actor.kind},
			${actor.name}, ${actor.kind}, ${at}, ${at})`);
		await db.execute(sql`INSERT INTO attachments
			(id, ticket_id, filename, mime, size, sha256, actor_name, actor_kind, created_at)
			VALUES (${attachmentId}, ${ticketId}, ${filename}, ${mime}, 1, ${sha}, ${actor.name}, ${actor.kind}, ${at})`);
		const attachment = (await db.execute(sql`SELECT filename, mime FROM attachments WHERE id = ${attachmentId}`))
			.rows[0]!;
		expect(AttachmentSchema.shape.filename.parse(attachment.filename)).toBe(filename);
		expect(attachment.mime).toBe(mime);
		await db.execute(sql`INSERT INTO page_uploads
			(id, project_id, sha256, size, mime, original_name, actor_name, actor_kind, created_at, expires_at)
			VALUES (${uploadId}, ${projectId}, ${sha}, 1, ${mime}, ${filename}, ${actor.name}, ${actor.kind}, ${at},
			${new Date(at.getTime() + 86_400_000)})`);
		const upload = (await db.execute(sql`SELECT original_name, mime FROM page_uploads WHERE id = ${uploadId}`))
			.rows[0]!;
		expect(PageUploadSchema.shape.originalName.parse(upload.original_name)).toBe(filename);
		expect(upload.mime).toBe(mime);
		await db.execute(sql`INSERT INTO page_assets (page_id, version, path, sha256, size, mime)
			VALUES (${pageId}, 1, 'asset.bin', ${sha}, 1, ${mime})`);
		expect((await db.execute(sql`SELECT mime FROM page_assets WHERE page_id = ${pageId}`)).rows).toEqual([{ mime }]);
		for (const path of ["../escape", "C:/escape", "a//b", "a/./b", "a\\b", "a\u0085b"])
			await expect(
				db.execute(sql`UPDATE page_versions SET source_path = ${path} WHERE page_id = ${pageId}`),
			).rejects.toThrow("page_versions_source_path_check");
		for (const path of ["index.html", ".trellis/secret", "../escape", "界".repeat(342)])
			await expect(db.execute(sql`UPDATE page_assets SET path = ${path} WHERE page_id = ${pageId}`)).rejects.toThrow(
				"page_assets_path_check",
			);
		await expect(db.execute(sql`UPDATE attachments SET filename = 'a/b' WHERE id = ${attachmentId}`)).rejects.toThrow(
			"attachments_filename_check",
		);
		await expect(db.execute(sql`UPDATE page_uploads SET original_name = 'a/b' WHERE id = ${uploadId}`)).rejects.toThrow(
			"page_uploads_original_name_check",
		);
		await expect(
			db.execute(sql`UPDATE page_assets SET mime = ${"text/plain\r\nx: y"} WHERE page_id = ${pageId}`),
		).rejects.toThrow("page_assets_mime_check");
	} finally {
		await rm(directory, { recursive: true, force: true });
		await db.$client.close();
	}
}, 60_000);
