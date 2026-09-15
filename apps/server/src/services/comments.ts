import {
	type Comment,
	CommentCreateInputSchema,
	type CommentDeleteOutputSchema,
	CommentIdInputSchema,
	type CommentNotification,
	CommentResolveInputSchema,
	type CommentThread,
	CommentUpdateInputSchema,
	type StoredActorKind,
} from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { z } from "zod";
import { requireActor, type ServiceCtx } from "../context.ts";
import { commentNotifications } from "../db/queries/commentNotifications.ts";
import { iso, rows } from "../db/queries/support.ts";
import { ticketSummary } from "../db/queries/ticketGet.ts";
import type { Tx } from "../db/tx.ts";
import { fail, invalidInput } from "../errors.ts";
import { record } from "./activity.ts";
import { upsert } from "./actors.ts";
import { enqueue } from "./commentMentions/enqueue.ts";
import { assertProjectActive, resolveTicket, type TicketRow } from "./refs.ts";

type RawComment = {
	id: string;
	ticket_id: string;
	parent_id: string | null;
	resolved_at: string | null;
	body: string;
	notifications: CommentNotification[];
	actor_name: string;
	actor_kind: StoredActorKind;
	actor_display_name: string | null;
	created_at: string;
	updated_at: string;
};

const commentSelect = sql`SELECT c.id, c.ticket_id, c.parent_id, ${iso(sql`c.resolved_at`)} AS resolved_at, c.body, ${commentNotifications(sql`c.id`)} AS notifications, c.actor_name, c.actor_kind, r.persona_name AS actor_display_name,
	${iso(sql`c.created_at`)} AS created_at, ${iso(sql`c.updated_at`)} AS updated_at FROM comments c
	LEFT JOIN agent_runs r ON c.actor_kind = 'agent' AND r.id = c.actor_name`;

const toComment = (row: RawComment): Comment => ({
	id: row.id,
	ticketId: row.ticket_id,
	parentId: row.parent_id,
	resolvedAt: row.resolved_at,
	body: row.body,
	...(row.notifications.length === 0 ? {} : { notifications: row.notifications }),
	actor: {
		name: row.actor_name,
		kind: row.actor_kind,
		...(row.actor_display_name === null ? {} : { displayName: row.actor_display_name }),
	},
	createdAt: row.created_at,
	updatedAt: row.updated_at,
});

const commentById = async (tx: Tx, id: string) => {
	const found = await rows<RawComment>(tx, sql`${commentSelect} WHERE c.id = ${id}`);
	if (found.length === 0) throw fail("NOT_FOUND", { kind: "comment", ref: id });
	return toComment(found[0] as RawComment);
};

// A comment's ticket, checked for a write: an archived project refuses it.
const ticketOfComment = async (ctx: ServiceCtx, tx: Tx, comment: Comment) => {
	const row = await resolveTicket(ctx, tx, comment.ticketId);
	assertProjectActive(ctx, row.projectId);
	return row;
};

// A comment changes the ticket's `commentCount`, so the ticket's version
// bumps and a ticket.updated event follows the comment event. `touch` moves
// `updated_at` too: a new comment is user-visible activity on the ticket.
const bumpTicket = async (ctx: ServiceCtx, tx: Tx, batchId: string, row: TicketRow, touch: boolean) => {
	const updatedAt = touch ? sql`, updated_at = ${ctx.now}` : sql``;
	await tx.execute(sql`UPDATE tickets SET version = version + 1 ${updatedAt} WHERE id = ${row.id}`);
	const summary = await ticketSummary(tx, row.id);
	ctx.emit({ type: "ticket.updated", summary, fields: ["commentCount"], batchId });
};

// The activity row of one comment write. `meta.commentId` names the comment,
// because the activity table holds no column for it.
const activityFor = (
	row: TicketRow,
	action: string,
	batchId: string,
	commentId: string,
	parentId: string | null = null,
	resolved?: boolean,
) => ({
	rootId: row.rootId,
	projectId: row.projectId,
	ticketId: row.id,
	action,
	batchId,
	changes: [
		{
			field: null,
			from: null,
			to: null,
			meta: { commentId, parentId, threadId: parentId ?? commentId, ...(resolved === undefined ? {} : { resolved }) },
		},
	],
});

export const create = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<Comment> => {
	const input = CommentCreateInputSchema.parse(rawInput);
	const row = await resolveTicket(ctx, tx, input.ticket);
	assertProjectActive(ctx, row.projectId);
	const parent = input.parentId === undefined ? null : await commentById(tx, input.parentId);
	if (parent !== null && parent.ticketId !== row.id) throw fail("COMMENT_PARENT_MISMATCH");
	const parentId = parent === null ? null : (parent.parentId ?? parent.id);
	const actor = requireActor(ctx);
	if (input.dedupeKey !== undefined) {
		await tx.execute(sql`SELECT id FROM tickets WHERE id=${row.id} FOR UPDATE`);
		const [existing] = await rows<RawComment>(
			tx,
			sql`${commentSelect}
			WHERE c.ticket_id=${row.id} AND c.actor_kind=${actor.kind} AND c.actor_name=${actor.name}
			AND c.dedupe_key=${input.dedupeKey}`,
		);
		if (existing) {
			if (existing.body !== input.body || existing.parent_id !== parentId)
				throw invalidInput(
					"dedupeKey",
					"This key already identifies another comment. Update that comment or use a new revision key.",
				);
			return toComment(existing);
		}
	}
	const batchId = ulid();
	const id = ulid();
	// The comment row names its actor, and a foreign key needs the actor row
	// first. The comment can be the first write of a new actor.
	await upsert(ctx, tx, actor);
	await tx.execute(
		sql`INSERT INTO comments (id, ticket_id, parent_id, body, dedupe_key, actor_name, actor_kind, created_at, updated_at)
			VALUES (${id}, ${row.id}, ${parentId}, ${input.body}, ${input.dedupeKey ?? null}, ${actor.name}, ${actor.kind}, ${ctx.now}, ${ctx.now})`,
	);
	await enqueue(tx, { commentId: id, ticketId: row.id, projectId: row.projectId, body: input.body });
	await record(ctx, tx, activityFor(row, "comment.created", batchId, id, parentId));
	ctx.emit({
		type: "comment.created",
		id,
		parentId,
		threadId: parentId ?? id,
		ticketId: row.id,
		projectId: row.projectId,
	});
	await bumpTicket(ctx, tx, batchId, row, true);
	return commentById(tx, id);
};

export const update = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<Comment> => {
	const input = CommentUpdateInputSchema.parse(rawInput);
	const comment = await commentById(tx, input.id);
	const row = await ticketOfComment(ctx, tx, comment);
	const batchId = ulid();
	await tx.execute(sql`UPDATE comments SET body = ${input.body}, updated_at = ${ctx.now} WHERE id = ${comment.id}`);
	await enqueue(tx, {
		commentId: comment.id,
		ticketId: row.id,
		projectId: row.projectId,
		body: input.body,
		previousBody: comment.body,
	});
	await record(ctx, tx, activityFor(row, "comment.updated", batchId, comment.id, comment.parentId));
	ctx.emit({
		type: "comment.updated",
		id: comment.id,
		parentId: comment.parentId,
		threadId: comment.parentId ?? comment.id,
		ticketId: row.id,
		projectId: row.projectId,
	});
	return commentById(tx, comment.id);
};

const remove = async (
	ctx: ServiceCtx,
	tx: Tx,
	rawInput: unknown,
): Promise<z.infer<typeof CommentDeleteOutputSchema>> => {
	const input = CommentIdInputSchema.parse(rawInput);
	const comment = await commentById(tx, input.id);
	const row = await ticketOfComment(ctx, tx, comment);
	const batchId = ulid();
	const replies = await rows(tx, sql`SELECT id FROM comments WHERE parent_id = ${comment.id} LIMIT 1`);
	if (replies.length > 0) throw fail("COMMENT_HAS_REPLIES");
	await tx.execute(sql`DELETE FROM comments WHERE id = ${comment.id}`);
	await record(ctx, tx, activityFor(row, "comment.deleted", batchId, comment.id, comment.parentId));
	ctx.emit({
		type: "comment.deleted",
		id: comment.id,
		parentId: comment.parentId,
		threadId: comment.parentId ?? comment.id,
		ticketId: row.id,
		projectId: row.projectId,
	});
	await bumpTicket(ctx, tx, batchId, row, false);
	return { deleted: comment.id };
};

export { remove as delete };

export const thread = async (_ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<CommentThread> => {
	const input = CommentIdInputSchema.parse(rawInput);
	const comment = await commentById(tx, input.id);
	const root = comment.parentId === null ? comment : await commentById(tx, comment.parentId);
	const replies = await rows<RawComment>(
		tx,
		sql`${commentSelect} WHERE c.parent_id = ${root.id} ORDER BY c.created_at, c.id`,
	);
	return { root, replies: replies.map(toComment) };
};

export const resolve = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<Comment> => {
	const input = CommentResolveInputSchema.parse(rawInput);
	const comment = await commentById(tx, input.id);
	const root = comment.parentId === null ? comment : await commentById(tx, comment.parentId);
	const row = await ticketOfComment(ctx, tx, root);
	if ((root.resolvedAt !== null) === input.resolved) return root;
	const batchId = ulid();
	await tx.execute(sql`UPDATE comments SET resolved_at = ${input.resolved ? ctx.now : null} WHERE id = ${root.id}`);
	await record(ctx, tx, activityFor(row, "comment.updated", batchId, root.id, null, input.resolved));
	ctx.emit({
		type: "comment.updated",
		id: root.id,
		parentId: null,
		threadId: root.id,
		resolved: input.resolved,
		ticketId: row.id,
		projectId: row.projectId,
	});
	await bumpTicket(ctx, tx, batchId, row, true);
	return commentById(tx, root.id);
};
