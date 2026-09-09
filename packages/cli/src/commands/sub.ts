import type { Priority } from "@trellis/api";
import { defineCommand } from "citty";
import { clientOf } from "../client.ts";
import { compact, contextOf, readText } from "../context.ts";
import { printRecord, ticketRecord } from "../output.ts";
import { priorities } from "./create.ts";

// The sub-ticket lands in the parent's project unless -p names another.
export default defineCommand({
	meta: { name: "sub", description: "Create a sub-ticket" },
	args: {
		ticket: { type: "positional", required: true, description: "Parent ticket ref" },
		title: { type: "string", alias: "t", required: true, description: "Title" },
		description: { type: "string", alias: "d", description: "Description text, or - for stdin" },
		priority: { type: "enum", options: [...priorities], description: "Priority" },
		status: { type: "string", description: "Status ref" },
		project: { type: "string", alias: "p", description: "Project ref; the parent's project when absent" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const client = clientOf(ctx);
		const project = args.project ?? (await client.tickets.get({ ticket: args.ticket })).project.path;
		const ticket = await client.tickets.create(
			compact({
				project,
				parent: args.ticket,
				title: args.title,
				description: args.description === undefined ? undefined : await readText(ctx, args.description),
				priority: args.priority as Priority | undefined,
				status: args.status,
			}),
		);
		printRecord(ctx.out, ctx.format, ticket, ticketRecord);
	},
});
