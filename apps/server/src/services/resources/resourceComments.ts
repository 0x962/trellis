import {
	type ActorRef,
	ResourceCommentAnchorsInputSchema,
	ResourceCommentCreateInputSchema,
	ResourceCommentEditInputSchema,
	ResourceCommentIdInputSchema,
	ResourceCommentListInputSchema,
	ResourceCommentReplyInputSchema,
	ResourceCommentResolveInputSchema,
	type ResourceCommentThread,
} from "@trellis/api";
import { type SQL, sql } from "drizzle-orm";
import { ulid } from "ulid";
import { actorDisplayName } from "../../db/queries/actorDisplayName.ts";
import { iso, rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { invalidInput } from "../../errors.ts";
import { assertProjectActive } from "../refs.ts";
import { type IoCtx, notFound, touchActor } from "../support.ts";

type CommentRow = {
	id: string;
	resource_id: string;
	thread_id: string;
	body: string;
	quote: string | null;
	prefix: string | null;
	suffix: string | null;
	text_removed: boolean;
	resolved_at: string | null;
	resolved_by_name: string | null;
	resolved_by_kind: ActorRef["kind"] | null;
	resolved_by_display_name: string | null;
	actor_name: string;
	actor_kind: ActorRef["kind"];
	actor_display_name: string | null;
	created_at: string;
	updated_at: string;
};

type ResourceRow = { id: string; kind: string; project_id: string };

const actorOf = (name: string, kind: ActorRef["kind"], displayName: string | null): ActorRef => ({
	name,
	kind,
	...(displayName === null ? {} : { displayName }),
});

const commentsWhere = async (tx: Tx, where: SQL) =>
	rows<CommentRow>(
		tx,
		sql`SELECT c.id, c.resource_id, c.thread_id, c.body, c.quote, c.prefix, c.suffix, c.text_removed,
			${iso(sql`c.resolved_at`)} AS resolved_at, c.resolved_by_name, c.resolved_by_kind,
			${actorDisplayName(sql`c.resolved_by_name`, sql`c.resolved_by_kind`)} AS resolved_by_display_name,
			c.actor_name, c.actor_kind, ${actorDisplayName(sql`c.actor_name`, sql`c.actor_kind`)} AS actor_display_name,
			${iso(sql`c.created_at`)} AS created_at, ${iso(sql`c.updated_at`)} AS updated_at
			FROM resource_comments c WHERE ${where}
			ORDER BY c.created_at, c.id`,
	);

// The rows come in the order they were written, and the first comment of a
// thread is written before its replies. So the first row of each thread id
// is the first comment, and the threads come out oldest first.
const toThreads = (found: CommentRow[]): ResourceCommentThread[] => {
	const threads = new Map<string, ResourceCommentThread>();
	for (const row of found) {
		const comment = {
			id: row.id,
			body: row.body,
			actor: actorOf(row.actor_name, row.actor_kind, row.actor_display_name),
			createdAt: row.created_at,
			updatedAt: row.updated_at,
		};
		const thread = threads.get(row.thread_id);
		if (thread !== undefined) {
			thread.comments.push(comment);
			continue;
		}
		threads.set(row.thread_id, {
			id: row.thread_id,
			resourceId: row.resource_id,
			anchor: { quote: row.quote!, prefix: row.prefix!, suffix: row.suffix! },
			textRemoved: row.text_removed,
			resolved:
				row.resolved_at === null
					? null
					: {
							actor: actorOf(row.resolved_by_name!, row.resolved_by_kind!, row.resolved_by_display_name),
							at: row.resolved_at,
						},
			comments: [comment],
		});
	}
	return [...threads.values()];
};

const threadById = async (tx: Tx, threadId: string) => {
	const [thread] = toThreads(await commentsWhere(tx, sql`c.thread_id = ${threadId}`));
	return thread!;
};

const findResource = async (tx: Tx, id: string) => {
	const [row] = await rows<ResourceRow>(
		tx,
		sql`SELECT er.id, er.kind, e.project_id FROM epic_resources er JOIN epics e ON e.id = er.epic_id
			WHERE er.id = ${id}`,
	);
	if (row === undefined) throw notFound("resource", id);
	return row;
};

// A comment with the project of its document.
const findComment = async (tx: Tx, id: string) => {
	const [row] = await rows<{
		id: string;
		thread_id: string;
		resource_id: string;
		actor_name: string;
		actor_kind: string;
	}>(tx, sql`SELECT id, thread_id, resource_id, actor_name, actor_kind FROM resource_comments WHERE id = ${id}`);
	if (row === undefined) throw notFound("resourceComment", id);
	return { ...row, resource: await findResource(tx, row.resource_id) };
};

const findThread = async (tx: Tx, id: string) => {
	const comment = await findComment(tx, id);
	if (comment.thread_id !== comment.id) throw notFound("resourceCommentThread", id);
	return comment;
};

const assertOwn = (ctx: IoCtx, comment: { actor_name: string; actor_kind: string }, verb: string) => {
	if (comment.actor_name !== ctx.actor.name || comment.actor_kind !== ctx.actor.kind)
		throw invalidInput("id", `${verb} your own comment only.`);
};

const changed = (ctx: IoCtx, resource: ResourceRow) =>
	ctx.emit({ type: "resource-comments.changed", projectId: resource.project_id, resourceId: resource.id });

export const list = async (_ctx: IoCtx, tx: Tx, rawInput: unknown) => {
	const input = ResourceCommentListInputSchema.parse(rawInput);
	const resource = await findResource(tx, input.resource);
	return toThreads(await commentsWhere(tx, sql`c.resource_id = ${resource.id}`));
};

export const create = async (ctx: IoCtx, tx: Tx, rawInput: unknown) => {
	const input = ResourceCommentCreateInputSchema.parse(rawInput);
	const resource = await findResource(tx, input.resource);
	if (resource.kind !== "doc") throw invalidInput("resource", "Select a document resource.");
	assertProjectActive(ctx.core, resource.project_id);
	const id = ulid();
	const at = ctx.now();
	await touchActor(tx, ctx.actor, at);
	await tx.execute(sql`INSERT INTO resource_comments (
		id, resource_id, thread_id, body, quote, prefix, suffix, actor_name, actor_kind, created_at, updated_at
	) VALUES (
		${id}, ${resource.id}, ${id}, ${input.body}, ${input.anchor.quote}, ${input.anchor.prefix},
		${input.anchor.suffix}, ${ctx.actor.name}, ${ctx.actor.kind}, ${at}, ${at}
	)`);
	changed(ctx, resource);
	return threadById(tx, id);
};

// An anchor is part of the document, as the text it points at, so a move
// keeps `updated_at` of the comment.
export const anchors = async (ctx: IoCtx, tx: Tx, rawInput: unknown) => {
	const input = ResourceCommentAnchorsInputSchema.parse(rawInput);
	const resource = await findResource(tx, input.resource);
	assertProjectActive(ctx.core, resource.project_id);
	for (const { thread, anchor, textRemoved } of input.anchors) {
		const moved = await rows<{ id: string }>(
			tx,
			sql`UPDATE resource_comments SET quote = ${anchor.quote}, prefix = ${anchor.prefix}, suffix = ${anchor.suffix},
				text_removed = ${textRemoved}
				WHERE id = ${thread} AND thread_id = ${thread} AND resource_id = ${resource.id} RETURNING id`,
		);
		if (moved.length === 0) throw notFound("resourceCommentThread", thread);
	}
	if (input.anchors.length > 0) changed(ctx, resource);
	return toThreads(await commentsWhere(tx, sql`c.resource_id = ${resource.id}`));
};

export const reply = async (ctx: IoCtx, tx: Tx, rawInput: unknown) => {
	const input = ResourceCommentReplyInputSchema.parse(rawInput);
	const thread = await findThread(tx, input.thread);
	assertProjectActive(ctx.core, thread.resource.project_id);
	const at = ctx.now();
	await touchActor(tx, ctx.actor, at);
	await tx.execute(sql`INSERT INTO resource_comments (
		id, resource_id, thread_id, body, actor_name, actor_kind, created_at, updated_at
	) VALUES (
		${ulid()}, ${thread.resource_id}, ${thread.id}, ${input.body}, ${ctx.actor.name}, ${ctx.actor.kind}, ${at}, ${at}
	)`);
	changed(ctx, thread.resource);
	return threadById(tx, thread.id);
};

export const resolve = async (ctx: IoCtx, tx: Tx, rawInput: unknown) => {
	const input = ResourceCommentResolveInputSchema.parse(rawInput);
	const thread = await findThread(tx, input.thread);
	assertProjectActive(ctx.core, thread.resource.project_id);
	const at = ctx.now();
	await touchActor(tx, ctx.actor, at);
	await tx.execute(
		input.resolved
			? sql`UPDATE resource_comments SET resolved_at = ${at}, resolved_by_name = ${ctx.actor.name},
				resolved_by_kind = ${ctx.actor.kind} WHERE id = ${thread.id}`
			: sql`UPDATE resource_comments SET resolved_at = NULL, resolved_by_name = NULL, resolved_by_kind = NULL
				WHERE id = ${thread.id}`,
	);
	changed(ctx, thread.resource);
	return threadById(tx, thread.id);
};

export const edit = async (ctx: IoCtx, tx: Tx, rawInput: unknown) => {
	const input = ResourceCommentEditInputSchema.parse(rawInput);
	const comment = await findComment(tx, input.id);
	assertOwn(ctx, comment, "Edit");
	assertProjectActive(ctx.core, comment.resource.project_id);
	await tx.execute(
		sql`UPDATE resource_comments SET body = ${input.body}, updated_at = ${ctx.now()} WHERE id = ${comment.id}`,
	);
	changed(ctx, comment.resource);
	return threadById(tx, comment.thread_id);
};

// The first comment of a thread takes its replies with it, as the foreign
// key of `thread_id` cascades.
export const remove = async (ctx: IoCtx, tx: Tx, rawInput: unknown) => {
	const input = ResourceCommentIdInputSchema.parse(rawInput);
	const comment = await findComment(tx, input.id);
	assertOwn(ctx, comment, "Delete");
	assertProjectActive(ctx.core, comment.resource.project_id);
	await tx.execute(sql`DELETE FROM resource_comments WHERE id = ${comment.id}`);
	changed(ctx, comment.resource);
	return { deleted: comment.id };
};
