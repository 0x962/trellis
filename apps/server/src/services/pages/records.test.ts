import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { type ActorRef, PageSummarySchema, type TrellisEvent } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import { createCache } from "../../db/cache.ts";
import { openTestDb } from "../../db/testDb.ts";
import type { Tx } from "../../db/tx.ts";
import { get, list, pin, remove, restore, update } from "./pages.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
const cache = createCache();
const events: TrellisEvent[] = [];
const at = new Date("2026-09-24T16:00:00.000Z");
const human = { name: "Navid", kind: "human" as const };
const agentId = ulid();
const agent = { name: agentId, kind: "agent" as const };
const listProject = { id: ulid(), key: "LST", slug: "page-list" };
const writeProject = { id: ulid(), key: "WRT", slug: "page-write" };
const deleteProject = { id: ulid(), key: "DEL", slug: "page-delete" };
const archivedProject = { id: ulid(), key: "ARC", slug: "page-archive" };
const oldPage = ulid();
const newPage = ulid();
const deletedPage = ulid();
const writePage = ulid();
const removePage = ulid();
const removeCursorId = ulid();
const removeCompletedReservationId = ulid();
const expiredPage = ulid();
const archivedPage = ulid();
const archivedDeletedPage = ulid();

const inTx = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

const contextOf = (actor: ActorRef | null, now = at): ServiceCtx => ({
	actor,
	session: null,
	reqId: ulid(),
	now,
	emit: (event) => events.push(event),
	cache,
	actorCache: new Map(),
	dropBlobs: () => {},
	publicUrl: "http://127.0.0.1:4521",
});

const insertProject = (project: typeof listProject, archived = false) =>
	db.execute(sql`INSERT INTO projects (id, key, slug, name, archived_at, created_at, updated_at)
		VALUES (${project.id}, ${project.key}, ${project.slug}, ${project.key}, ${archived ? at : null}, ${at}, ${at})`);

const insertPage = async (input: {
	id: string;
	projectId: string;
	slug: string;
	title: string;
	publishedAt?: Date;
	deletedAt?: Date;
	searchText?: string;
}) => {
	const publishedAt = input.publishedAt ?? at;
	const deleted = input.deletedAt !== undefined;
	await db.execute(sql`INSERT INTO pages (
		id, project_id, slug, title, summary, version, latest_version,
		creator_actor_name, creator_actor_kind, actor_name, actor_kind,
		created_at, updated_at, deleted_at, deleted_actor_name, deleted_actor_kind
	) VALUES (
		${input.id}, ${input.projectId}, ${input.slug}, ${input.title}, '', ${deleted ? 2 : 1}, 1,
		${agent.name}, ${agent.kind}, ${deleted ? human.name : agent.name}, ${deleted ? human.kind : agent.kind},
		${publishedAt}, ${publishedAt}, ${input.deletedAt ?? null},
		${deleted ? human.name : null}, ${deleted ? human.kind : null}
	)`);
	await db.execute(sql`INSERT INTO page_versions (
		page_id, number, request_id, document_sha256, document_size, search_text, source_agent_id,
		source_path, actor_name, actor_kind, created_at
	) VALUES (
		${input.id}, 1, ${crypto.randomUUID()}, ${"a".repeat(64)}, 100, ${input.searchText ?? ""}, ${agentId},
		'report/index.html', ${agent.name}, ${agent.kind}, ${publishedAt}
	)`);
};

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO actors (name, kind, first_seen_at, last_seen_at) VALUES
		(${human.name}, ${human.kind}, ${at}, ${at}), (${agent.name}, ${agent.kind}, ${at}, ${at})`);
	await insertProject(listProject);
	await insertProject(writeProject);
	await insertProject(deleteProject);
	await insertProject(archivedProject, true);
	await db.execute(sql`INSERT INTO agent_runs (
		id, name, kind, instruction, project_id, project_key, created_at, updated_at
	) VALUES (${agentId}, 'Page agent', 'agent', 'Publish a Page.', ${listProject.id}, ${listProject.key}, ${at}, ${at})`);
	await insertPage({
		id: oldPage,
		projectId: listProject.id,
		slug: "old-report",
		title: "Forecast report",
		publishedAt: new Date(at.getTime() - 2 * 60 * 60 * 1000),
	});
	await insertPage({
		id: newPage,
		projectId: listProject.id,
		slug: "new-report",
		title: "New report",
		searchText: "Revenue forecast chart",
		publishedAt: new Date(at.getTime() - 60 * 60 * 1000),
	});
	await insertPage({ id: deletedPage, projectId: listProject.id, slug: "gone", title: "Gone", deletedAt: at });
	await insertPage({ id: writePage, projectId: writeProject.id, slug: "stable", title: "Stable ref" });
	await insertPage({ id: removePage, projectId: deleteProject.id, slug: "soft-delete", title: "Soft delete" });
	await insertPage({
		id: expiredPage,
		projectId: deleteProject.id,
		slug: "expired",
		title: "Expired",
		deletedAt: new Date(at.getTime() - 30 * 24 * 60 * 60 * 1000),
	});
	await insertPage({ id: archivedPage, projectId: archivedProject.id, slug: "retained", title: "Retained" });
	await insertPage({
		id: archivedDeletedPage,
		projectId: archivedProject.id,
		slug: "deleted",
		title: "Deleted",
		deletedAt: at,
	});
	await db.execute(sql`INSERT INTO page_watches (
		page_id, agent_id, cursor_at, cursor_id, last_completed_reservation_id, created_at, updated_at
	) VALUES
		(${newPage}, ${agentId}, NULL, NULL, NULL, ${at}, ${at}),
		(${removePage}, ${agentId}, ${at}, ${removeCursorId}, ${removeCompletedReservationId}, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO page_assets (page_id, version, path, sha256, size, mime)
		VALUES (${oldPage}, 1, 'chart.png', ${"b".repeat(64)}, 25, 'image/png')`);
	await db.execute(sql`INSERT INTO page_comment_threads (
		id, page_id, version, anchor_kind, anchor, actor_name, actor_kind,
		resolved_at, resolved_by_name, resolved_by_kind, created_at, updated_at
	) VALUES
		(${ulid()}, ${oldPage}, 1, 'element', ${JSON.stringify({ kind: "element", path: "main" })}::jsonb,
			${human.name}, ${human.kind}, ${at}, ${human.name}, ${human.kind}, ${at}, ${at}),
		(${ulid()}, ${newPage}, 1, 'element', ${JSON.stringify({ kind: "element", path: "main" })}::jsonb,
			${human.name}, ${human.kind}, NULL, NULL, NULL, ${at}, ${at})`);
	await inTx(cache.rebuild);
}, 30_000);

afterAll(async () => {
	await db.$client.close();
});

describe("Page reads", () => {
	test("lists pinned pages first and binds the cursor to the filters", async () => {
		const ctx = contextOf(human);
		await inTx((tx) => pin(ctx, tx, { page: oldPage, pinned: true }));
		const first = await inTx((tx) => list(ctx, tx, { project: listProject.key, limit: 1 }));
		expect(first.items.map((page) => page.id)).toEqual([oldPage]);
		expect(first.nextCursor).not.toBeNull();
		const second = await inTx((tx) => list(ctx, tx, { project: listProject.key, limit: 1, cursor: first.nextCursor! }));
		expect(second.items.map((page) => page.id)).toEqual([newPage]);
		await expect(
			inTx((tx) => list(ctx, tx, { project: listProject.key, pinned: true, cursor: first.nextCursor! })),
		).rejects.toMatchObject({ code: "INVALID_CURSOR" });
		expect((await inTx((tx) => list(ctx, tx, { project: listProject.key, pinned: true }))).items).toHaveLength(1);
		expect((await inTx((tx) => list(contextOf(null), tx, { project: listProject.key }))).items).toHaveLength(2);
		for (const pinned of [true, false]) {
			await expect(inTx((tx) => list(contextOf(null), tx, { project: listProject.key, pinned }))).rejects.toMatchObject(
				{ code: "ACTOR_REQUIRED" },
			);
		}
		expect((await inTx((tx) => list(ctx, tx, { project: listProject.key, watcher: agentId }))).items[0]?.id).toBe(
			newPage,
		);
		expect((await inTx((tx) => list(ctx, tx, { project: listProject.key, comment: "open" }))).items[0]?.id).toBe(
			newPage,
		);
		expect((await inTx((tx) => list(ctx, tx, { project: listProject.key, q: "Revenue" }))).items[0]?.id).toBe(newPage);
		expect((await inTx((tx) => list(ctx, tx, { project: listProject.key, q: "%" }))).items).toEqual([]);
		const ranked = await inTx((tx) =>
			list(contextOf(agent), tx, { project: listProject.key, q: "forecast", limit: 1 }),
		);
		expect(ranked.items.map((page) => page.id)).toEqual([oldPage]);
		expect(ranked.nextCursor).not.toBeNull();
		expect(
			(
				await inTx((tx) =>
					list(contextOf(agent), tx, {
						project: listProject.key,
						q: "forecast",
						limit: 1,
						cursor: ranked.nextCursor!,
					}),
				)
			).items.map((page) => page.id),
		).toEqual([newPage]);
	});

	test("reads a stable ref with the requested immutable version", async () => {
		const page = await inTx((tx) => get(contextOf(human), tx, { page: "lst/pages/old-report" }));
		expect(PageSummarySchema.parse(page)).toMatchObject({
			id: oldPage,
			ref: "LST/pages/old-report",
			pinned: true,
			openThreadCount: 0,
		});
		expect(page.requestedVersion).toMatchObject({ pageId: oldPage, number: 1, sourceAgentId: agentId });
		expect(page.assetCount).toBe(1);
		expect(page.totalThreadCount).toBe(1);
		expect(page.resolvedThreadCount).toBe(1);
	});
});

describe("Page writes", () => {
	test("updates metadata without changing the stable ref", async () => {
		const ctx = contextOf(human);
		const changed = await inTx((tx) =>
			update(ctx, tx, { page: "WRT/pages/stable", title: "New title", summary: "Current", expectedVersion: 1 }),
		);
		expect(changed).toMatchObject({ ref: "WRT/pages/stable", slug: "stable", title: "New title", revision: 2 });
		await expect(
			inTx((tx) => update(ctx, tx, { page: writePage, title: "Stale", expectedVersion: 1 })),
		).rejects.toMatchObject({ code: "PAGE_VERSION_CONFLICT", data: { current: { id: writePage, revision: 2 } } });
		await expect(
			inTx((tx) => update(contextOf(null), tx, { page: writePage, title: "No actor", expectedVersion: 2 })),
		).rejects.toMatchObject({ code: "ACTOR_REQUIRED" });
	});

	test("pins per actor", async () => {
		const ctx = contextOf(human);
		expect(await inTx((tx) => pin(ctx, tx, { page: writePage, pinned: true }))).toEqual({
			pageId: writePage,
			pinned: true,
		});
		expect((await inTx((tx) => get(ctx, tx, { page: writePage }))).pinned).toBe(true);
		expect((await inTx((tx) => get(contextOf(agent), tx, { page: writePage }))).pinned).toBe(false);
		expect(await inTx((tx) => pin(ctx, tx, { page: writePage, pinned: false }))).toEqual({
			pageId: writePage,
			pinned: false,
		});
	});

	test("serves archived project reads and rejects every Page mutation", async () => {
		const ctx = contextOf(human);
		expect((await inTx((tx) => get(ctx, tx, { page: archivedPage }))).id).toBe(archivedPage);
		expect((await inTx((tx) => get(ctx, tx, { page: archivedDeletedPage, includeDeleted: true }))).id).toBe(
			archivedDeletedPage,
		);
		await expect(
			inTx((tx) => update(ctx, tx, { page: archivedPage, title: "Blocked", expectedVersion: 1 })),
		).rejects.toMatchObject({ code: "PROJECT_ARCHIVED" });
		await expect(inTx((tx) => pin(ctx, tx, { page: archivedPage, pinned: true }))).rejects.toMatchObject({
			code: "PROJECT_ARCHIVED",
		});
		await expect(inTx((tx) => remove(ctx, tx, { page: archivedPage, expectedVersion: 1 }))).rejects.toMatchObject({
			code: "PROJECT_ARCHIVED",
		});
		await expect(
			inTx((tx) => restore(ctx, tx, { page: archivedDeletedPage, expectedVersion: 2 })),
		).rejects.toMatchObject({ code: "PROJECT_ARCHIVED" });
	});

	test("soft-deletes and restores a page with its watch cursor", async () => {
		const humanCtx = contextOf(human);
		await inTx((tx) => pin(humanCtx, tx, { page: removePage, pinned: true }));
		await expect(
			inTx((tx) => remove(contextOf(agent), tx, { page: removePage, expectedVersion: 1 })),
		).rejects.toMatchObject({
			code: "AGENT_CANNOT_DELETE",
			message: "An agent needs force to delete or restore a page.",
		});
		await expect(inTx((tx) => remove(humanCtx, tx, { page: removePage, expectedVersion: 2 }))).rejects.toMatchObject({
			code: "PAGE_VERSION_CONFLICT",
			data: { current: { revision: 1 } },
		});
		const eventStart = events.length;
		const deleted = await inTx((tx) => remove(humanCtx, tx, { page: removePage, expectedVersion: 1 }));
		expect(deleted).toMatchObject({ revision: 2, pinned: true, watcher: null, deletedBy: human });
		expect(deleted.purgeAt).toBe(new Date(at.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString());
		await expect(inTx((tx) => get(humanCtx, tx, { page: removePage }))).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect((await inTx((tx) => get(humanCtx, tx, { page: removePage, includeDeleted: true }))).deletedAt).toBe(
			at.toISOString(),
		);
		const savedWatch = await db.execute(
			sql`SELECT cursor_id, last_completed_reservation_id FROM page_watches WHERE page_id = ${removePage}`,
		);
		expect(savedWatch.rows).toEqual([
			{ cursor_id: removeCursorId, last_completed_reservation_id: removeCompletedReservationId },
		]);
		await expect(inTx((tx) => restore(humanCtx, tx, { page: removePage, expectedVersion: 1 }))).rejects.toMatchObject({
			code: "PAGE_VERSION_CONFLICT",
			data: { current: { revision: 2 } },
		});
		const restored = await inTx((tx) => restore(humanCtx, tx, { page: removePage, expectedVersion: 2 }));
		expect(restored).toMatchObject({
			revision: 3,
			deletedAt: null,
			purgeAt: null,
			watcher: { pageId: removePage, agent: { id: agentId, name: "Page agent" } },
			pinned: true,
		});
		expect(events.slice(eventStart).map((event) => event.type)).toEqual(["pages.changed", "pages.changed"]);
	});

	test("refuses restore after the retention window before it checks the revision", async () => {
		await expect(
			inTx((tx) => restore(contextOf(human), tx, { page: expiredPage, expectedVersion: 2 })),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		await expect(
			inTx((tx) => restore(contextOf(human), tx, { page: expiredPage, expectedVersion: 1 })),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});
