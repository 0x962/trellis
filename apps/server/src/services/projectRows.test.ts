import { beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { toProjectSummary } from "../db/queries/projectSummary.ts";
import { openTestDb } from "../db/testDb.ts";
import type { Tx } from "../db/tx.ts";
import { assertColorFree, projectRow } from "./projectRows.ts";

// `assertColorFree`, and the two rules of the database that stand behind it.
// One database for the file. Every project of the file takes its own key, so
// no test reads a row another test wrote.
let db: Awaited<ReturnType<typeof openTestDb>>;

const at = new Date("2026-09-23T10:00:00.000Z");
const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

const holder = ulid();

const newProject = (key: string, color: string | null) =>
	db.execute(
		sql`INSERT INTO projects (id, key, slug, name, color, created_at, updated_at)
			VALUES (${ulid()}, ${key}, ${key.toLowerCase()}, ${key}, ${color}, ${at}, ${at})`,
	);

const countHuman = { name: "Page count human", kind: "human" as const };
const countAgent = { name: ulid(), kind: "agent" as const };

const countPage = async (projectId: string, slug: string, deleted = false) => {
	const id = ulid();
	await db.execute(sql`INSERT INTO pages (
		id, project_id, slug, title, creator_actor_name, creator_actor_kind,
		actor_name, actor_kind, deleted_at, deleted_actor_name, deleted_actor_kind,
		created_at, updated_at
	) VALUES (
		${id}, ${projectId}, ${slug}, ${slug}, ${countAgent.name}, ${countAgent.kind},
		${deleted ? countHuman.name : countAgent.name}, ${deleted ? countHuman.kind : countAgent.kind},
		${deleted ? at : null}, ${deleted ? countHuman.name : null}, ${deleted ? countHuman.kind : null},
		${at}, ${at}
	)`);
	await db.execute(sql`INSERT INTO page_versions (
		page_id, number, request_id, document_sha256, document_size, source_path,
		actor_name, actor_kind, created_at
	) VALUES (
		${id}, 1, ${crypto.randomUUID()}, ${"a".repeat(64)}, 1, 'page.html',
		${countAgent.name}, ${countAgent.kind}, ${at}
	)`);
	return id;
};

const countThread = async (pageId: string, resolved = false) => {
	const id = ulid();
	await db.execute(sql`INSERT INTO page_comment_threads (
		id, page_id, version, anchor_kind, anchor, actor_name, actor_kind,
		resolved_at, resolved_by_name, resolved_by_kind, created_at, updated_at
	) VALUES (
		${id}, ${pageId}, 1, 'element', ${JSON.stringify({ kind: "element", path: "main" })}::jsonb,
		${countAgent.name}, ${countAgent.kind}, ${resolved ? at : null},
		${resolved ? countHuman.name : null}, ${resolved ? countHuman.kind : null}, ${at}, ${at}
	)`);
	return id;
};

const countComment = (threadId: string, kind: "human" | "agent", deleted = false) =>
	db.execute(sql`INSERT INTO page_comments (
		id, thread_id, body, actor_name, actor_kind, created_at, updated_at, deleted_at
	) VALUES (
		${ulid()}, ${threadId}, 'Comment', ${kind === "human" ? countHuman.name : countAgent.name}, ${kind},
		${at}, ${at}, ${deleted ? at : null}
	)`);

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(
		sql`INSERT INTO projects (id, key, slug, name, color, created_at, updated_at)
			VALUES (${holder}, 'BLU', 'blu', 'Blue holder', 'blue', ${at}, ${at})`,
	);
});

test("the database refuses a second project with one color", async () => {
	await expect(newProject("TKN", "blue")).rejects.toThrow(/projects_color_idx|duplicate key/i);
});

test("the database refuses a color that is not one of the five", async () => {
	await expect(newProject("YLW", "yellow")).rejects.toThrow(/projects_color_check/i);
});

test("any number of projects hold no color", async () => {
	await newProject("NC1", null);
	await newProject("NC2", null);
	const found = await db.execute(sql`SELECT count(*)::int AS n FROM projects WHERE color IS NULL`);
	expect((found.rows[0] as { n: number }).n).toBe(2);
});

test("a taken color is not free, and the project that holds it keeps it", async () => {
	await run(async (tx) => {
		await expect(assertColorFree(tx, "blue", null)).rejects.toThrow("A row with this value exists.");
		await expect(assertColorFree(tx, "blue", holder)).resolves.toBeUndefined();
		await expect(assertColorFree(tx, "teal", null)).resolves.toBeUndefined();
	});
});

test("the project summary counts Pages with visible human comments on open threads", async () => {
	const projectId = ulid();
	const otherProjectId = ulid();
	await db.execute(sql`INSERT INTO actors (name, kind, first_seen_at, last_seen_at) VALUES
		(${countHuman.name}, ${countHuman.kind}, ${at}, ${at}),
		(${countAgent.name}, ${countAgent.kind}, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at) VALUES
		(${projectId}, 'PGC', 'page-count', 'Page count', ${at}, ${at}),
		(${otherProjectId}, 'OTH', 'other-count', 'Other count', ${at}, ${at})`);

	const repeatedPage = await countPage(projectId, "repeated");
	await countComment(await countThread(repeatedPage), "human");
	await countComment(await countThread(repeatedPage), "human");

	const mixedPage = await countPage(projectId, "mixed");
	const mixedThread = await countThread(mixedPage);
	await countComment(mixedThread, "agent");
	await countComment(mixedThread, "human");

	const resolvedPage = await countPage(projectId, "resolved");
	await countComment(await countThread(resolvedPage, true), "human");
	const agentPage = await countPage(projectId, "agent-only");
	await countComment(await countThread(agentPage), "agent");
	const deletedCommentPage = await countPage(projectId, "deleted-comment");
	await countComment(await countThread(deletedCommentPage), "human", true);
	const deletedPage = await countPage(projectId, "deleted-page", true);
	await countComment(await countThread(deletedPage), "human");

	const otherPage = await countPage(otherProjectId, "other-page");
	await countComment(await countThread(otherPage), "human");

	const summary = toProjectSummary(await run((tx) => projectRow(tx, projectId)));
	const otherSummary = toProjectSummary(await run((tx) => projectRow(tx, otherProjectId)));
	expect(summary.openPageCommentCount).toBe(2);
	expect(otherSummary.openPageCommentCount).toBe(1);
});
