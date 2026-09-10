import type { Comment } from "@trellis/api";
import { defineCommand } from "citty";
import { clientOf } from "../client.ts";
import { compact, contextOf, readText, toNumber } from "../context.ts";
import { cell, printList, printRecord, type RecordSpec } from "../output.ts";
import { commentItems, commentList, renderComments } from "../timeline.ts";

const commentRecord: RecordSpec<Comment> = {
	fields: [
		{ name: "id", value: (row) => row.id },
		{ name: "ticketId", value: (row) => row.ticketId },
		{ name: "actor", value: (row) => `${row.actor.kind}:${row.actor.name}` },
		{ name: "created", value: (row) => row.createdAt },
		{ name: "body", value: (row) => cell(row.body) },
	],
	identifier: (row) => row.id,
};

export default defineCommand({
	meta: { name: "comment", description: "Add a comment" },
	args: {
		ticket: { type: "positional", required: true, description: "Ticket ref" },
		body: { type: "string", required: true, description: "Comment text, or - for stdin" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const comment = await clientOf(ctx).comments.create({ ticket: args.ticket, body: await readText(ctx, args.body) });
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
		const page = await clientOf(ctx).timeline.list(compact({ ticket: args.ticket, limit: toNumber(args.limit) }));
		const items = commentItems(page.items);
		if (ctx.format.mode === "table") {
			ctx.out.write(renderComments(items));
			return;
		}
		printList(ctx.out, ctx.format, items, commentList);
	},
});
