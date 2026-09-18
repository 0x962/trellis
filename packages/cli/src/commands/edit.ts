import type { Priority } from "@trellis/api";
import { defineCommand } from "citty";
import { clientOf } from "../client.ts";
import { compact, contextOf, noneToNull, readText, toNumber } from "../context.ts";
import { printRecord, ticketRecord } from "../output.ts";
import { priorities } from "./create.ts";

export default defineCommand({
	meta: { name: "edit", description: "Change ticket fields" },
	args: {
		ticket: { type: "positional", required: true, description: "Ticket ref" },
		title: { type: "string", description: "New title" },
		description: { type: "string", description: "New description, or - for stdin" },
		priority: { type: "enum", options: [...priorities], description: "New priority" },
		parent: { type: "string", description: "New parent ref, or none to clear it" },
		epic: { type: "string", description: "New epic ref, or none to clear it" },
		project: { type: "string", description: "New project ref" },
		status: { type: "string", description: "New status ref" },
		"expect-version": { type: "string", description: "Fail unless the ticket is at this version" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const ticket = await clientOf(ctx).tickets.update(
			compact({
				ticket: args.ticket,
				title: args.title,
				description: args.description === undefined ? undefined : await readText(ctx, args.description),
				priority: args.priority as Priority | undefined,
				parent: noneToNull(args.parent),
				epic: noneToNull(args.epic),
				project: args.project,
				status: args.status,
				expectedVersion: toNumber(args["expect-version"]),
			}),
		);
		printRecord(ctx.out, ctx.format, ticket, ticketRecord);
	},
});
