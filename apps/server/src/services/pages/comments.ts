import {
	type ActorRef,
	type PageCommentAnchor,
	PageCommentCreateInputSchema,
	PageCommentEditInputSchema,
	PageCommentIdInputSchema,
	PageCommentListInputSchema,
	PageCommentReplyInputSchema,
	PageCommentResolveInputSchema,
	type PageCommentThread,
} from "@trellis/api";
import { type SQL, sql } from "drizzle-orm";
import { ulid } from "ulid";
import { requireActor, type ServiceCtx } from "../../context.ts";
import { actorDisplayName } from "../../db/queries/actorDisplayName.ts";
import { iso, rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { fail, invalidInput } from "../../errors.ts";
import { upsert } from "../actors.ts";
import { assertProjectActive } from "../refs.ts";
import { lockPage, resolvePage } from "./pages.ts";

type CommentRow = {
	thread_id: string;
	page_id: string;
	version: number;
	anchor: PageCommentAnchor;
	selected_text: string | null;
	creator_name: string;
	creator_kind: ActorRef["kind"];
	creator_display_name: string | null;
	resolved_at: string | null;
	resolved_by_name: string | null;
	resolved_by_kind: ActorRef["kind"] | null;
	resolved_by_display_name: string | null;
	thread_created_at: string;
	thread_updated_at: string;
	comment_id: string;
	body: string;
	comment_actor_name: string;
	comment_actor_kind: ActorRef["kind"];
	comment_actor_display_name: string | null;
	comment_created_at: string;
	comment_updated_at: string;
	comment_deleted_at: string | null;
};

type ThreadRow = {
	id: string;
	page_id: string;
	version: number;
	project_id: string;
	deleted_at: string | null;
};

type CommentOwnerRow = ThreadRow & {
	comment_id: string;
	actor_name: string;
	actor_kind: ActorRef["kind"];
};

const actorOf = (name: string, kind: ActorRef["kind"], displayName: string | null): ActorRef => ({
	name,
	kind,
	...(displayName === null ? {} : { displayName }),
});

const commentRows = (tx: Tx, where: SQL) =>
	rows<CommentRow>(
		tx,
		sql`SELECT thread.id AS thread_id, thread.page_id, thread.version, thread.anchor, thread.selected_text,
			thread.actor_name AS creator_name, thread.actor_kind AS creator_kind,
			${actorDisplayName(sql`thread.actor_name`, sql`thread.actor_kind`)} AS creator_display_name,
			${iso(sql`thread.resolved_at`)} AS resolved_at, thread.resolved_by_name, thread.resolved_by_kind,
			${actorDisplayName(sql`thread.resolved_by_name`, sql`thread.resolved_by_kind`)} AS resolved_by_display_name,
			${iso(sql`thread.created_at`)} AS thread_created_at,
			${iso(sql`thread.updated_at`)} AS thread_updated_at,
			comment.id AS comment_id, comment.body, comment.actor_name AS comment_actor_name,
			comment.actor_kind AS comment_actor_kind,
			${actorDisplayName(sql`comment.actor_name`, sql`comment.actor_kind`)} AS comment_actor_display_name,
			${iso(sql`comment.created_at`)} AS comment_created_at,
			${iso(sql`comment.updated_at`)} AS comment_updated_at,
			${iso(sql`comment.deleted_at`)} AS comment_deleted_at
			FROM page_comment_threads thread
			JOIN page_comments comment ON comment.thread_id = thread.id
			WHERE ${where}
			ORDER BY thread.created_at, thread.id, comment.created_at, comment.id`,
	);

const toThreads = (found: CommentRow[]): PageCommentThread[] => {
	const threads = new Map<string, PageCommentThread>();
	for (const row of found) {
		const comment = {
			id: row.comment_id,
			threadId: row.thread_id,
			body: row.body,
			actor: actorOf(row.comment_actor_name, row.comment_actor_kind, row.comment_actor_display_name),
			createdAt: row.comment_created_at,
			updatedAt: row.comment_updated_at,
			deletedAt: row.comment_deleted_at,
		};
		const thread = threads.get(row.thread_id);
		if (thread !== undefined) {
			thread.comments.push(comment);
			continue;
		}
		threads.set(row.thread_id, {
			id: row.thread_id,
			pageId: row.page_id,
			version: row.version,
			anchor: row.anchor,
			selectedText: row.selected_text,
			creator: actorOf(row.creator_name, row.creator_kind, row.creator_display_name),
			resolved:
				row.resolved_at === null
					? null
					: {
							actor: actorOf(row.resolved_by_name!, row.resolved_by_kind!, row.resolved_by_display_name),
							at: row.resolved_at,
						},
			comments: [comment],
			createdAt: row.thread_created_at,
			updatedAt: row.thread_updated_at,
		});
	}
	return [...threads.values()];
};

const threadById = async (tx: Tx, id: string) => {
	const [thread] = toThreads(await commentRows(tx, sql`thread.id = ${id}`));
	if (thread === undefined) throw fail("NOT_FOUND", { kind: "page comment thread", ref: id });
	return thread;
};

const findThread = async (tx: Tx, id: string) => {
	const [thread] = await rows<ThreadRow>(
		tx,
		sql`SELECT thread.id, thread.page_id, thread.version, page.project_id,
			${iso(sql`page.deleted_at`)} AS deleted_at
			FROM page_comment_threads thread
			JOIN pages page ON page.id = thread.page_id
			WHERE thread.id = ${id}
			FOR UPDATE OF page`,
	);
	if (thread === undefined) throw fail("NOT_FOUND", { kind: "page comment thread", ref: id });
	return thread;
};

const findComment = async (tx: Tx, id: string) => {
	const [comment] = await rows<CommentOwnerRow>(
		tx,
		sql`SELECT comment.id AS comment_id, comment.actor_name, comment.actor_kind,
			thread.id, thread.page_id, thread.version, page.project_id,
			${iso(sql`page.deleted_at`)} AS deleted_at
			FROM page_comments comment
			JOIN page_comment_threads thread ON thread.id = comment.thread_id
			JOIN pages page ON page.id = thread.page_id
			WHERE comment.id = ${id} AND comment.deleted_at IS NULL
			FOR UPDATE OF page`,
	);
	if (comment === undefined) throw fail("NOT_FOUND", { kind: "page comment", ref: id });
	return comment;
};

const assertWritable = (ctx: ServiceCtx, row: Pick<ThreadRow, "project_id" | "deleted_at">) => {
	assertProjectActive(ctx, row.project_id);
	if (row.deleted_at !== null) throw fail("PAGE_DELETED");
};

const changed = (ctx: ServiceCtx, row: Pick<ThreadRow, "project_id" | "page_id" | "version">) =>
	ctx.emit({ type: "page-comments.changed", projectId: row.project_id, pageId: row.page_id, version: row.version });

export const list = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown) => {
	const input = PageCommentListInputSchema.parse(rawInput);
	const page = await resolvePage(ctx, tx, input.page, true);
	if (page.deleted_at !== null) throw fail("PAGE_DELETED");
	let where = sql`thread.page_id = ${page.id}`;
	if (input.version !== undefined) where = sql`${where} AND thread.version = ${input.version}`;
	if (input.resolved !== undefined)
		where = sql`${where} AND thread.resolved_at IS ${input.resolved ? sql`NOT NULL` : sql`NULL`}`;
	return toThreads(await commentRows(tx, where));
};

export const create = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown) => {
	const input = PageCommentCreateInputSchema.parse(rawInput);
	const page = await lockPage(ctx, tx, input.page, true);
	assertWritable(ctx, { project_id: page.project_id, deleted_at: page.deleted_at });
	const version = await rows<{ number: number }>(
		tx,
		sql`SELECT number FROM page_versions WHERE page_id = ${page.id} AND number = ${input.version}`,
	);
	if (version.length === 0) throw fail("NOT_FOUND", { kind: "page version", ref: `${input.page}@${input.version}` });
	if (input.version !== page.latest_version) throw invalidInput("version", "Comment on the latest Page version.");
	const actor = requireActor(ctx);
	const id = ulid();
	await upsert(ctx, tx, actor);
	await tx.execute(sql`INSERT INTO page_comment_threads (
		id, page_id, version, anchor_kind, anchor, selected_text,
		actor_name, actor_kind, created_at, updated_at
	) VALUES (
		${id}, ${page.id}, ${input.version}, ${input.anchor.kind}, ${input.anchor},
		${input.anchor.kind === "text" ? input.anchor.quote : null},
		${actor.name}, ${actor.kind}, ${ctx.now}, ${ctx.now}
	)`);
	await tx.execute(sql`INSERT INTO page_comments (
		id, thread_id, body, actor_name, actor_kind, created_at, updated_at
	) VALUES (${ulid()}, ${id}, ${input.body}, ${actor.name}, ${actor.kind}, ${ctx.now}, ${ctx.now})`);
	changed(ctx, { project_id: page.project_id, page_id: page.id, version: input.version });
	return threadById(tx, id);
};

export const reply = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown) => {
	const input = PageCommentReplyInputSchema.parse(rawInput);
	const thread = await findThread(tx, input.thread);
	assertWritable(ctx, thread);
	const actor = requireActor(ctx);
	await upsert(ctx, tx, actor);
	await tx.execute(sql`INSERT INTO page_comments (
		id, thread_id, body, actor_name, actor_kind, created_at, updated_at
	) VALUES (${ulid()}, ${thread.id}, ${input.body}, ${actor.name}, ${actor.kind}, ${ctx.now}, ${ctx.now})`);
	await tx.execute(sql`UPDATE page_comment_threads SET updated_at = ${ctx.now} WHERE id = ${thread.id}`);
	changed(ctx, thread);
	return threadById(tx, thread.id);
};

export const resolve = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown) => {
	const input = PageCommentResolveInputSchema.parse(rawInput);
	const thread = await findThread(tx, input.thread);
	assertWritable(ctx, thread);
	const actor = requireActor(ctx);
	if (input.resolved) await upsert(ctx, tx, actor);
	await tx.execute(
		input.resolved
			? sql`UPDATE page_comment_threads SET resolved_at = ${ctx.now}, resolved_by_name = ${actor.name},
				resolved_by_kind = ${actor.kind}, updated_at = ${ctx.now} WHERE id = ${thread.id}`
			: sql`UPDATE page_comment_threads SET resolved_at = NULL, resolved_by_name = NULL,
				resolved_by_kind = NULL, updated_at = ${ctx.now} WHERE id = ${thread.id}`,
	);
	changed(ctx, thread);
	return threadById(tx, thread.id);
};

export const edit = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown) => {
	const input = PageCommentEditInputSchema.parse(rawInput);
	const comment = await findComment(tx, input.id);
	assertWritable(ctx, comment);
	const actor = requireActor(ctx);
	if (comment.actor_name !== actor.name || comment.actor_kind !== actor.kind)
		throw invalidInput("id", "Edit your own comment only.");
	const updated = await rows<{ id: string }>(
		tx,
		sql`UPDATE page_comments SET body = ${input.body}, updated_at = ${ctx.now}
			WHERE id = ${comment.comment_id} AND deleted_at IS NULL RETURNING id`,
	);
	if (updated.length === 0) throw fail("NOT_FOUND", { kind: "page comment", ref: comment.comment_id });
	await tx.execute(sql`UPDATE page_comment_threads SET updated_at = ${ctx.now} WHERE id = ${comment.id}`);
	changed(ctx, comment);
	return threadById(tx, comment.id);
};

export const remove = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown) => {
	const input = PageCommentIdInputSchema.parse(rawInput);
	const comment = await findComment(tx, input.id);
	assertWritable(ctx, comment);
	const actor = requireActor(ctx);
	if (comment.actor_name !== actor.name || comment.actor_kind !== actor.kind)
		throw invalidInput("id", "Delete your own comment only.");
	const removed = await rows<{ id: string }>(
		tx,
		sql`UPDATE page_comments SET body = 'Comment deleted', deleted_at = ${ctx.now}, updated_at = ${ctx.now}
			WHERE id = ${comment.comment_id} AND deleted_at IS NULL RETURNING id`,
	);
	if (removed.length === 0) throw fail("NOT_FOUND", { kind: "page comment", ref: comment.comment_id });
	await tx.execute(sql`UPDATE page_comment_threads SET updated_at = ${ctx.now} WHERE id = ${comment.id}`);
	changed(ctx, comment);
	return { deleted: comment.comment_id };
};
