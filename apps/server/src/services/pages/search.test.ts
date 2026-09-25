import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import { createCache } from "../../db/cache.ts";
import { SEARCH_TIMEOUT_MS } from "../../db/queries/search.ts";
import { openTestDb } from "../../db/testDb.ts";
import type { Tx } from "../../db/tx.ts";
import { pageObjectPath } from "../../storage/pageObjects.ts";
import { backfillSearchText, prepareSearchBackfill } from "./backfillSearchText.ts";
import { PAGE_SEARCH_TEXT_MAX_BYTES, staticPageText } from "./content.ts";
import { pageSearchStatement, searchPages } from "./search.ts";

const at = new Date("2026-09-25T12:00:00.000Z");
const actor = { name: "Navid", kind: "human" as const };
const firstProject = { id: ulid(), key: "ONE" };
const secondProject = { id: ulid(), key: "TWO" };
let db: Awaited<ReturnType<typeof openTestDb>>;
let home: string;

const context = (): ServiceCtx => ({
	actor,
	session: null,
	reqId: ulid(),
	now: at,
	emit: () => {},
	cache: createCache(),
	actorCache: new Map(),
	dropBlobs: () => {},
	publicUrl: "http://trellis.test",
});

const insertProject = (project: typeof firstProject) =>
	db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
		VALUES (${project.id}, ${project.key}, ${project.key.toLowerCase()}, ${project.key}, ${at}, ${at})`);

const insertPage = async (input: {
	projectId: string;
	title: string;
	summary?: string;
	searchText?: string;
	deleted?: boolean;
	oldSearchText?: string;
}) => {
	const id = ulid();
	const version = input.oldSearchText === undefined ? 1 : 2;
	await db.execute(sql`INSERT INTO pages (
		id, project_id, slug, title, summary, version, latest_version,
		creator_actor_name, creator_actor_kind, actor_name, actor_kind,
		created_at, updated_at, deleted_at, deleted_actor_name, deleted_actor_kind
	) VALUES (
		${id}, ${input.projectId}, ${id.toLowerCase()}, ${input.title}, ${input.summary ?? ""}, ${version}, ${version},
		${actor.name}, ${actor.kind}, ${actor.name}, ${actor.kind}, ${at}, ${at}, ${input.deleted ? at : null},
		${input.deleted ? actor.name : null}, ${input.deleted ? actor.kind : null}
	)`);
	if (input.oldSearchText !== undefined)
		await db.execute(sql`INSERT INTO page_versions (
			page_id, number, request_id, document_sha256, document_size, search_text,
			search_indexed, source_path, actor_name, actor_kind, created_at
		) VALUES (
			${id}, 1, ${crypto.randomUUID()}, ${"a".repeat(64)}, 10, ${input.oldSearchText},
			true, 'index.html', ${actor.name}, ${actor.kind}, ${new Date(at.getTime() - 1000)}
		)`);
	await db.execute(sql`INSERT INTO page_versions (
		page_id, number, request_id, document_sha256, document_size, search_text,
		search_indexed, source_path, actor_name, actor_kind, created_at
	) VALUES (
		${id}, ${version}, ${crypto.randomUUID()}, ${"b".repeat(64)}, 10, ${input.searchText ?? ""},
		true, 'index.html', ${actor.name}, ${actor.kind}, ${at}
	)`);
	return id;
};

beforeAll(async () => {
	home = await mkdtemp(join(tmpdir(), "trellis-page-search-"));
	db = await openTestDb();
	await db.execute(sql`INSERT INTO actors (name, kind, first_seen_at, last_seen_at)
		VALUES (${actor.name}, ${actor.kind}, ${at}, ${at})`);
	await insertProject(firstProject);
	await insertProject(secondProject);
}, 30_000);

afterAll(async () => {
	await db.$client.close();
	await rm(home, { recursive: true, force: true });
});

test("extracts normalized static text without script content", () => {
	const text = staticPageText(`<!doctype html>
		<head><title>Browser title</title><style>.secret { display: block }</style></head>
		<body><h1>Revenue &amp; rooms</h1><p> North&nbsp;wing </p>
		<script>document.body.textContent = "dynamic secret"</script>
		<template>template secret</template><noscript>fallback secret</noscript>
		<div hidden>hidden secret</div><p>Forecast</p></body>`);

	expect(text).toBe("Revenue & rooms North wing Forecast");
});

test("keeps the static text within one MiB of complete UTF-8 characters", () => {
	const text = staticPageText(`<p>${"a".repeat(PAGE_SEARCH_TEXT_MAX_BYTES - 2)}€</p>`);

	expect(new TextEncoder().encode(text).byteLength).toBe(PAGE_SEARCH_TEXT_MAX_BYTES - 2);
	expect(text.endsWith("�")).toBe(false);
});

test("ranks title, summary, and latest content and excludes deleted Pages", async () => {
	const title = await insertPage({ projectId: firstProject.id, title: "Forecast title" });
	const summary = await insertPage({ projectId: firstProject.id, title: "Summary row", summary: "Forecast summary" });
	const content = await insertPage({ projectId: firstProject.id, title: "Content row", searchText: "Forecast chart" });
	await insertPage({
		projectId: firstProject.id,
		title: "Old row",
		oldSearchText: "Forecast old",
		searchText: "Current",
	});
	await insertPage({ projectId: firstProject.id, title: "Forecast deleted", deleted: true });

	const found = await db.transaction((tx) => searchPages(context(), tx, { q: "forec", limit: 20 }));

	expect(found.map((page) => page.id)).toEqual([title, summary, content]);
});

test("applies project scope, project rank, and the result limit", async () => {
	const first = await insertPage({ projectId: firstProject.id, title: "Scoped match" });
	const second = await insertPage({ projectId: secondProject.id, title: "Scoped match" });
	const ranked = await db.transaction((tx) =>
		searchPages(context(), tx, { q: "scoped", rankProjectIds: [secondProject.id], limit: 2 }),
	);
	const scoped = await db.transaction((tx) =>
		searchPages(context(), tx, { q: "scoped", projectIds: [firstProject.id], limit: 1 }),
	);

	expect(ranked.map((page) => page.id)).toEqual([second, first]);
	expect(scoped.map((page) => page.id)).toEqual([first]);
});

test("fills an old latest version once from its stored document", async () => {
	const pageId = ulid();
	const sha256 = "c".repeat(64);
	await db.execute(sql`INSERT INTO pages (
		id, project_id, slug, title, summary, version, latest_version,
		creator_actor_name, creator_actor_kind, actor_name, actor_kind, created_at, updated_at
	) VALUES (
		${pageId}, ${firstProject.id}, ${pageId.toLowerCase()}, 'Old Page', '', 1, 1,
		${actor.name}, ${actor.kind}, ${actor.name}, ${actor.kind}, ${at}, ${at}
	)`);
	await db.execute(sql`INSERT INTO page_versions (
		page_id, number, request_id, document_sha256, document_size,
		source_path, actor_name, actor_kind, created_at
	) VALUES (
		${pageId}, 1, ${crypto.randomUUID()}, ${sha256}, 30,
		'index.html', ${actor.name}, ${actor.kind}, ${at}
	)`);
	const path = pageObjectPath(home, sha256);
	await mkdir(dirname(path), { recursive: true });
	await Bun.write(path, "<main>Backfilled forecast</main>");
	const prepareContext = {
		home,
		newTx: <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn),
	} as Parameters<typeof prepareSearchBackfill>[0];

	const prepared = await prepareSearchBackfill(prepareContext);
	expect(prepared.entries).toEqual([{ pageId, number: 1, searchText: "Backfilled forecast" }]);
	expect(await db.transaction((tx) => backfillSearchText({} as never, tx, prepared))).toEqual({
		updated: 1,
		pending: false,
	});
	expect(await prepareSearchBackfill(prepareContext)).toEqual({ entries: [], pending: false });
	const stored = (
		await db.execute(sql`SELECT search_text, search_indexed FROM page_versions WHERE page_id = ${pageId}`)
	).rows[0];
	expect(stored).toEqual({ search_text: "Backfilled forecast", search_indexed: true });
});

test("uses the three Page search indexes at 10,000 Pages", async () => {
	await db.execute(sql`INSERT INTO pages (
		id, project_id, slug, title, summary, version, latest_version,
		creator_actor_name, creator_actor_kind, actor_name, actor_kind, created_at, updated_at
	)
	SELECT 'scale-' || n, ${secondProject.id}, 'scale-' || n,
		CASE WHEN n = 1 THEN 'Planprobe title' ELSE 'Scale title ' || n END,
		CASE WHEN n = 2 THEN 'Planprobe summary' ELSE '' END,
		1, 1, ${actor.name}, ${actor.kind}, ${actor.name}, ${actor.kind}, ${at}, ${at}
	FROM generate_series(1, 10000) AS n`);
	await db.execute(sql`INSERT INTO page_versions (
		page_id, number, request_id, document_sha256, document_size, search_text, search_indexed,
		source_path, actor_name, actor_kind, created_at
	)
	SELECT 'scale-' || n, 1, 'scale-request-' || n, ${"d".repeat(64)}, 10,
		CASE WHEN n = 3 THEN 'Planprobe content' ELSE '' END,
		true, 'index.html', ${actor.name}, ${actor.kind}, ${at}
	FROM generate_series(1, 10000) AS n`);
	await db.execute(sql`ANALYZE pages`);
	await db.execute(sql`ANALYZE page_versions`);
	const explained = await db.execute(
		sql`EXPLAIN (FORMAT JSON) ${pageSearchStatement(context(), { q: "planprobe", limit: 20 })}`,
	);
	const plan = JSON.stringify(explained.rows[0]);

	expect(plan).toContain("pages_title_search_idx");
	expect(plan).toContain("pages_summary_search_idx");
	expect(plan).toContain("page_versions_search_text_idx");
	const found = await db.transaction(async (tx) => {
		await tx.execute(sql`SET LOCAL statement_timeout = ${sql.raw(String(SEARCH_TIMEOUT_MS))}`);
		return searchPages(context(), tx, { q: "planprobe", limit: 20 });
	});
	expect(found.map((page) => page.id)).toEqual(["scale-1", "scale-2", "scale-3"]);
});
