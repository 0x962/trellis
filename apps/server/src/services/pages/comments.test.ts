import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { ActorRef, TrellisEvent } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import { createCache } from "../../db/cache.ts";
import { openTestDb } from "../../db/testDb.ts";
import type { Tx } from "../../db/tx.ts";
import {
	createPageComment,
	deleteComment,
	editPageComment,
	listPageComments,
	replyToPageComment,
	setPageCommentResolved,
} from "./comments";

let db: Awaited<ReturnType<typeof openTestDb>>;
const cache = createCache();
const events: TrellisEvent[] = [];
const at = new Date("2026-09-25T20:00:00.000Z");
const human = { name: "Navid", kind: "human" as const };
const other = { name: "Reader", kind: "human" as const };
const agentId = ulid();
const agent = { name: agentId, kind: "agent" as const };
const project = { id: ulid(), key: "CMT", slug: "page-comments" };
const archivedProject = { id: ulid(), key: "ARC", slug: "archived-comments" };
const pageId = ulid();
const deletedPageId = ulid();
const archivedPageId = ulid();

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

const insertProject = (value: typeof project, archived = false) =>
	db.execute(sql`INSERT INTO projects (id, key, slug, name, archived_at, created_at, updated_at)
		VALUES (${value.id}, ${value.key}, ${value.slug}, ${value.key}, ${archived ? at : null}, ${at}, ${at})`);

const insertPage = async (id: string, projectId: string, slug: string, deleted = false) => {
	await db.execute(sql`INSERT INTO pages (
		id, project_id, slug, title, summary, version, latest_version,
		creator_actor_name, creator_actor_kind, actor_name, actor_kind,
		created_at, updated_at, deleted_at, deleted_actor_name, deleted_actor_kind
	) VALUES (
		${id}, ${projectId}, ${slug}, 'Review', '', ${deleted ? 3 : 2}, 2,
		${agent.name}, ${agent.kind}, ${deleted ? human.name : agent.name}, ${deleted ? human.kind : agent.kind},
		${at}, ${at}, ${deleted ? at : null}, ${deleted ? human.name : null}, ${deleted ? human.kind : null}
	)`);
	for (const number of [1, 2]) {
		await db.execute(sql`INSERT INTO page_versions (
			page_id, number, request_id, document_sha256, document_size, search_text,
			source_agent_id, source_path, actor_name, actor_kind, created_at
		) VALUES (
			${id}, ${number}, ${crypto.randomUUID()}, ${String(number).repeat(64)}, 100, '',
			${agentId}, 'report/index.html', ${agent.name}, ${agent.kind}, ${at}
		)`);
	}
};

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO actors (name, kind, first_seen_at, last_seen_at) VALUES
		(${human.name}, ${human.kind}, ${at}, ${at}),
		(${other.name}, ${other.kind}, ${at}, ${at}),
		(${agent.name}, ${agent.kind}, ${at}, ${at})`);
	await insertProject(project);
	await insertProject(archivedProject, true);
	await db.execute(sql`INSERT INTO agent_runs (
		id, name, kind, instruction, project_id, project_key, created_at, updated_at
	) VALUES (${agentId}, 'Page agent', 'agent', 'Review comments.', ${project.id}, ${project.key}, ${at}, ${at})`);
	await insertPage(pageId, project.id, "review");
	await insertPage(deletedPageId, project.id, "deleted", true);
	await insertPage(archivedPageId, archivedProject.id, "archived");
	await inTx(cache.rebuild);
}, 30_000);

afterAll(async () => {
	await db.$client.close();
});

describe("Page comments", () => {
	test("binds element and text threads to exact Page versions", async () => {
		const first = await inTx((tx) =>
			createPageComment(contextOf(human), tx, {
				page: `${project.key}/pages/review`,
				version: 2,
				anchor: { kind: "element", path: "html>body:nth-of-type(1)>main:nth-of-type(1)" },
				body: "Review this chart.",
			}),
		);
		const second = await inTx((tx) =>
			createPageComment(contextOf(agent), tx, {
				page: pageId,
				version: 2,
				anchor: { kind: "text", path: "main", quote: "Revenue grew", prefix: "", suffix: "." },
				body: "The source now matches.",
			}),
		);

		expect(first).toMatchObject({ pageId, version: 2, selectedText: null, creator: human });
		expect(second).toMatchObject({ pageId, version: 2, selectedText: "Revenue grew" });
		expect(
			(await inTx((tx) => listPageComments(contextOf(null), tx, { page: pageId }))).map((thread) => thread.id),
		).toEqual([first.id, second.id]);
		expect(events.slice(-2)).toEqual([
			{ type: "page-comments.changed", projectId: project.id, pageId, version: 2 },
			{ type: "page-comments.changed", projectId: project.id, pageId, version: 2 },
		]);
	});

	test("refuses a version that the Page does not hold", async () => {
		await expect(
			inTx((tx) =>
				createPageComment(contextOf(human), tx, {
					page: pageId,
					version: 3,
					anchor: { kind: "element", path: "main" },
					body: "This version is absent.",
				}),
			),
		).rejects.toMatchObject({ code: "NOT_FOUND", data: { kind: "page version" } });
		await expect(
			inTx((tx) =>
				createPageComment(contextOf(human), tx, {
					page: pageId,
					version: 1,
					anchor: { kind: "element", path: "main" },
					body: "This version is historical.",
				}),
			),
		).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
	});

	test("lets agents reply and resolve while preserving old-version threads", async () => {
		const threadId = ulid();
		const commentId = ulid();
		await db.execute(sql`INSERT INTO page_comment_threads (
			id, page_id, version, anchor_kind, anchor, selected_text,
			actor_name, actor_kind, created_at, updated_at
		) VALUES (
			${threadId}, ${pageId}, 1, 'element', ${{ kind: "element", path: "main" }}, NULL,
			${human.name}, ${human.kind}, ${at}, ${at}
		)`);
		await db.execute(sql`INSERT INTO page_comments (
			id, thread_id, body, actor_name, actor_kind, created_at, updated_at
		) VALUES (${commentId}, ${threadId}, 'Review version one.', ${human.name}, ${human.kind}, ${at}, ${at})`);
		const thread = (await inTx((tx) => listPageComments(contextOf(null), tx, { page: pageId }))).find(
			(candidate) => candidate.id === threadId,
		)!;
		const replied = await inTx((tx) => replyToPageComment(contextOf(agent), tx, { thread: thread!.id, body: "Done." }));
		expect(replied.comments.map((comment) => comment.actor.kind)).toEqual(["human", "agent"]);
		const resolved = await inTx((tx) =>
			setPageCommentResolved(contextOf(agent), tx, { thread: thread!.id, resolved: true }),
		);
		expect(resolved.resolved?.actor).toMatchObject({ kind: "agent", name: agentId, displayName: "Page agent" });
		expect(
			await inTx((tx) => listPageComments(contextOf(null), tx, { page: pageId, version: 1, resolved: true })),
		).toHaveLength(1);
		expect(
			await inTx((tx) => listPageComments(contextOf(null), tx, { page: pageId, version: 1, resolved: false })),
		).toHaveLength(0);
		expect(
			(await inTx((tx) => setPageCommentResolved(contextOf(human), tx, { thread: thread!.id, resolved: false })))
				.resolved,
		).toBeNull();
	});

	test("limits edit and delete to the comment author", async () => {
		const thread = await inTx((tx) =>
			createPageComment(contextOf(human), tx, {
				page: pageId,
				version: 2,
				anchor: { kind: "element", path: "main" },
				body: "Original body",
			}),
		);
		const comment = thread.comments[0]!;
		await expect(
			inTx((tx) => editPageComment(contextOf(other), tx, { id: comment.id, body: "Foreign edit" })),
		).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
		await expect(inTx((tx) => deleteComment(contextOf(other), tx, { id: comment.id }))).rejects.toMatchObject({
			code: "INPUT_VALIDATION_FAILED",
		});
		const edited = await inTx((tx) => editPageComment(contextOf(human), tx, { id: comment.id, body: "Saved body" }));
		expect(edited.comments[0]!.body).toBe("Saved body");
		expect(await inTx((tx) => deleteComment(contextOf(human), tx, { id: comment.id }))).toEqual({
			deleted: comment.id,
		});
		const saved = (await inTx((tx) => listPageComments(contextOf(null), tx, { page: pageId }))).find(
			(candidate) => candidate.id === thread.id,
		)!;
		expect(saved.comments[0]).toMatchObject({ body: "Comment deleted", deletedAt: at.toISOString() });
		await expect(
			inTx((tx) => editPageComment(contextOf(human), tx, { id: comment.id, body: "Late edit" })),
		).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
	});

	test("keeps a thread when its first comment is deleted", async () => {
		const thread = await inTx((tx) =>
			createPageComment(contextOf(human), tx, {
				page: pageId,
				version: 2,
				anchor: { kind: "element", path: "article" },
				body: "First",
			}),
		);
		await inTx((tx) => replyToPageComment(contextOf(agent), tx, { thread: thread.id, body: "Reply" }));
		await inTx((tx) => deleteComment(contextOf(human), tx, { id: thread.comments[0]!.id }));
		const saved = (await inTx((tx) => listPageComments(contextOf(null), tx, { page: pageId }))).find(
			(candidate) => candidate.id === thread.id,
		)!;
		expect(saved.comments).toHaveLength(2);
		expect(saved.comments[0]!.deletedAt).not.toBeNull();
		expect(saved.comments[1]!.body).toBe("Reply");
	});

	test("refuses mutations for archived projects and deleted Pages", async () => {
		for (const page of [archivedPageId, deletedPageId]) {
			await expect(
				inTx((tx) =>
					createPageComment(contextOf(human), tx, {
						page,
						version: 2,
						anchor: { kind: "element", path: "main" },
						body: "Blocked",
					}),
				),
			).rejects.toMatchObject({ code: page === archivedPageId ? "PROJECT_ARCHIVED" : "PAGE_DELETED" });
		}
		await expect(inTx((tx) => listPageComments(contextOf(null), tx, { page: deletedPageId }))).rejects.toMatchObject({
			code: "PAGE_DELETED",
		});
	});
});
