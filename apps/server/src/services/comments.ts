import {
	type Comment,
	CommentCreateInputSchema,
	type CommentDeleteOutputSchema,
	CommentIdInputSchema,
	CommentUpdateInputSchema,
	type StoredActorKind,
} from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { z } from "zod";
import type { Ctx } from "../context.ts";
import { iso, rows } from "../db/queries/support.ts";
import { ticketSummary } from "../db/queries/ticketGet.ts";
import type { Tx } from "../db/tx.ts";
import { type Batch, beginBatch } from "./activity.ts";
import { contractError } from "./errors.ts";
import { resolveTicket, type TicketRow } from "./refs.ts";
import { assertProjectOpen } from "./tickets/rules.ts";

type RawComment = {
	id: string;
	ticket_id: string;
	body: string;
	actor_name: string;
	actor_kind: StoredActorKind;
	created_at: string;
	updated_at: string;
};

const commentSelect = sql`SELECT c.id, c.ticket_id, c.body, c.actor_name, c.actor_kind,
	${iso(sql`c.created_at`)} AS created_at, ${iso(sql`c.updated_at`)} AS updated_at FROM comments c`;

const toComment = (row: RawComment): Comment => ({
	id: row.id,
	ticketId: row.ticket_id,
	body: row.body,
	actor: { name: row.actor_name, kind: row.actor_kind },
	createdAt: row.created_at,
	updatedAt: row.updated_at,
});

const commentById = async (tx: Tx, id: string) => {
	const found = await rows<RawComment>(tx, sql`${commentSelect} WHERE c.id = ${id}`);
	if (found.length === 0) throw contractError("NOT_FOUND", { kind: "comment", ref: id });
	return toComment(found[0] as RawComment);
};

// A comment's ticket, checked for a write: an archived project refuses it.
const ticketOfComment = async (ctx: Ctx, tx: Tx, comment: Comment) => {
	const row = await resolveTicket(ctx, tx, comment.ticketId);
	assertProjectOpen(row.project_archived);
	return row;
};

// A comment changes the ticket's `commentCount`, so the ticket's version
// bumps and a ticket.updated event follows the comment event. `touch` moves
// `updated_at` too: a new comment is user-visible activity on the ticket.
const bumpTicket = async (ctx: Ctx, tx: Tx, batch: Batch, row: TicketRow, touch: boolean) => {
	const updatedAt = touch ? sql`, updated_at = ${batch.now}` : sql``;
	await tx.execute(sql`UPDATE tickets SET version = version + 1 ${updatedAt} WHERE id = ${row.id}`);
	const summary = await ticketSummary(tx, row.id);
	ctx.emit({ type: "ticket.updated", summary, fields: ["commentCount"], batchId: batch.id });
};

const activityFor = (row: TicketRow, action: string, commentId: string) => ({
	rootId: row.root_id,
	projectId: row.project_id,
	ticketId: row.id,
	action,
	meta: { commentId },
});

export const create = async (ctx: Ctx, tx: Tx, rawInput: unknown): Promise<Comment> => {
	const input = CommentCreateInputSchema.parse(rawInput);
	const row = await resolveTicket(ctx, tx, input.ticket);
	assertProjectOpen(row.project_archived);
	const batch = await beginBatch(ctx, tx);
	const id = ulid();
	await tx.execute(
		sql`INSERT INTO comments (id, ticket_id, body, actor_name, actor_kind, created_at, updated_at)
			VALUES (${id}, ${row.id}, ${input.body}, ${batch.actor.name}, ${batch.actor.kind}, ${batch.now}, ${batch.now})`,
	);
	await batch.record(activityFor(row, "comment.created", id));
	ctx.emit({ type: "comment.created", id, ticketId: row.id });
	await bumpTicket(ctx, tx, batch, row, true);
	return commentById(tx, id);
};

export const update = async (ctx: Ctx, tx: Tx, rawInput: unknown): Promise<Comment> => {
	const input = CommentUpdateInputSchema.parse(rawInput);
	const comment = await commentById(tx, input.id);
	const row = await ticketOfComment(ctx, tx, comment);
	const batch = await beginBatch(ctx, tx);
	await tx.execute(sql`UPDATE comments SET body = ${input.body}, updated_at = ${batch.now} WHERE id = ${comment.id}`);
	await batch.record(activityFor(row, "comment.updated", comment.id));
	ctx.emit({ type: "comment.updated", id: comment.id, ticketId: row.id });
	return commentById(tx, comment.id);
};

const remove = async (ctx: Ctx, tx: Tx, rawInput: unknown): Promise<z.infer<typeof CommentDeleteOutputSchema>> => {
	const input = CommentIdInputSchema.parse(rawInput);
	const comment = await commentById(tx, input.id);
	const row = await ticketOfComment(ctx, tx, comment);
	const batch = await beginBatch(ctx, tx);
	await tx.execute(sql`DELETE FROM comments WHERE id = ${comment.id}`);
	await batch.record(activityFor(row, "comment.deleted", comment.id));
	ctx.emit({ type: "comment.deleted", id: comment.id, ticketId: row.id });
	await bumpTicket(ctx, tx, batch, row, false);
	return { deleted: comment.id };
};

export { remove as delete };
