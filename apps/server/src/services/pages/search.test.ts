import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import { createCache } from "../../db/cache.ts";
import { openTestDb } from "../../db/testDb.ts";
import { PAGE_SEARCH_TEXT_MAX_BYTES, searchPages, staticPageText } from "./search.ts";

const at = new Date("2026-09-25T12:00:00.000Z");
const actor = { name: "Navid", kind: "human" as const };
const firstProject = { id: ulid(), key: "ONE" };
const secondProject = { id: ulid(), key: "TWO" };
let db: Awaited<ReturnType<typeof openTestDb>>;

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
			source_path, actor_name, actor_kind, created_at
		) VALUES (
			${id}, 1, ${crypto.randomUUID()}, ${"a".repeat(64)}, 10, ${input.oldSearchText},
			'index.html', ${actor.name}, ${actor.kind}, ${new Date(at.getTime() - 1000)}
		)`);
	await db.execute(sql`INSERT INTO page_versions (
		page_id, number, request_id, document_sha256, document_size, search_text,
		source_path, actor_name, actor_kind, created_at
	) VALUES (
		${id}, ${version}, ${crypto.randomUUID()}, ${"b".repeat(64)}, 10, ${input.searchText ?? ""},
		'index.html', ${actor.name}, ${actor.kind}, ${at}
	)`);
	return id;
};

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO actors (name, kind, first_seen_at, last_seen_at)
		VALUES (${actor.name}, ${actor.kind}, ${at}, ${at})`);
	await insertProject(firstProject);
	await insertProject(secondProject);
}, 30_000);

afterAll(async () => {
	await db.$client.close();
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
