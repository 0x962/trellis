import type { Comment } from "@trellis/api";
import { defineCommand } from "citty";
import { clientOf } from "../client.ts";
import { compact, contextOf, readText, toNumber } from "../context.ts";
import { cell, printList, printRecord, type RecordSpec } from "../output.ts";
import { localDateTime } from "../time.ts";
import { type CommentItem, commentItems, commentList, renderComments } from "../timeline.ts";

export const commentRecord: RecordSpec<Comment> = {
	fields: [
		{ name: "id", value: (row) => row.id },
		{ name: "ticketId", value: (row) => row.ticketId },
		{ name: "parentId", value: (row) => cell(row.parentId) },
		{ name: "resolved", value: (row) => (row.resolvedAt === null ? "-" : localDateTime(row.resolvedAt)) },
		{ name: "actor", value: (row) => `${row.actor.kind}:${row.actor.displayName ?? row.actor.name}` },
		{ name: "created", value: (row) => localDateTime(row.createdAt) },
		{ name: "body", value: (row) => cell(row.body) },
	],
	identifier: (row) => row.id,
};

export default defineCommand({
	meta: { name: "comment", description: "Add a comment or reply" },
	args: {
		ticket: { type: "positional", required: true, description: "Ticket ref" },
		body: { type: "string", required: true, description: "Comment text, or - for stdin" },
		"reply-to": { type: "string", description: "Comment ID of the thread to reply to" },
		"dedupe-key": { type: "string", description: "Stable key for this comment subject and revision" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const comment = await clientOf(ctx).comments.create(
			compact({
				ticket: args.ticket,
				body: await readText(ctx, args.body),
				parentId: args["reply-to"],
				dedupeKey: args["dedupe-key"],
			}),
		);
		printRecord(ctx.out, ctx.format, comment, commentRecord);
	},
});

export const comments = defineCommand({
	meta: { name: "comments", description: "List the comments of a ticket" },
	args: {
		ticket: { type: "positional", required: true, description: "Ticket ref" },
		limit: { type: "string", description: "Timeline rows to read, at most 100" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const client = clientOf(ctx);
		const query = compact({ ticket: args.ticket, limit: toNumber(args.limit) });
		// The timeline holds comments and activity rows together, so a page
		// can hold no comment at all. Every page follows the cursor of the
		// answer before it, and the last page answers `nextCursor` null.
		const items: CommentItem[] = [];
		let before: string | undefined;
		do {
			const page = await client.timeline.list(compact({ ...query, before }));
			items.push(...commentItems(page.items));
			before = page.nextCursor ?? undefined;
		} while (before !== undefined);
		if (ctx.format.mode === "table") {
			ctx.out.write(renderComments(items));
			return;
		}
		printList(ctx.out, ctx.format, items, commentList);
	},
});
