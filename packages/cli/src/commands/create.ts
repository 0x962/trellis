import type { Priority } from "@trellis/api";
import { defineCommand } from "citty";
import { clientOf } from "../client.ts";
import { compact, contextOf, readText } from "../context.ts";
import { printRecord, ticketRecord } from "../output.ts";

export const priorities = ["none", "urgent", "high", "medium", "low"] as const;

export default defineCommand({
	meta: { name: "create", description: "Create a ticket" },
	args: {
		project: { type: "string", alias: "p", required: true, description: "Project ref" },
		title: { type: "string", alias: "t", required: true, description: "Title" },
		description: { type: "string", alias: "d", description: "Description text, or - for stdin" },
		priority: { type: "enum", options: [...priorities], description: "Priority" },
		status: { type: "string", description: "Status ref; the project default when absent" },
		parent: { type: "string", description: "Parent ticket ref" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const ticket = await clientOf(ctx).tickets.create(
			compact({
				project: args.project,
				title: args.title,
				description: args.description === undefined ? undefined : await readText(ctx, args.description),
				priority: args.priority as Priority | undefined,
				status: args.status,
				parent: args.parent,
			}),
		);
		printRecord(ctx.out, ctx.format, ticket, ticketRecord);
	},
});
