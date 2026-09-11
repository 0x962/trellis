import { defineCommand } from "citty";
import { clientOf } from "../client.ts";
import { contextOf } from "../context.ts";
import { json, printRecord } from "../output.ts";
import { renderComments } from "../timeline.ts";
import { commentRecord } from "./comment.ts";

const args = { id: { type: "positional" as const, required: true as const, description: "Comment ID in the thread" } };

const show = defineCommand({
	meta: { name: "show", description: "Show the root comment and every reply" },
	args,
	async run(context) {
		const ctx = contextOf(context);
		const thread = await clientOf(ctx).comments.thread({ id: context.args.id });
		if (ctx.format.mode === "table") {
			ctx.out.write(
				renderComments(
					[...thread.replies]
						.reverse()
						.concat(thread.root)
						.map((row) => ({ ...row, kind: "comment" })),
				),
			);
		} else if (ctx.format.mode === "quiet") {
			ctx.out.write(`${thread.root.id}\n`);
		} else {
			ctx.out.write(json(thread));
		}
	},
});

const resolution = (name: "resolve" | "reopen") =>
	defineCommand({
		meta: { name, description: name === "resolve" ? "Resolve a comment thread" : "Reopen a resolved thread" },
		args,
		async run(context) {
			const ctx = contextOf(context);
			const root = await clientOf(ctx).comments.resolve({ id: context.args.id, resolved: name === "resolve" });
			printRecord(ctx.out, ctx.format, root, commentRecord);
		},
	});

export default defineCommand({
	meta: { name: "thread", description: "Show, resolve, or reopen a comment thread" },
	subCommands: { show, resolve: resolution("resolve"), reopen: resolution("reopen") },
});
