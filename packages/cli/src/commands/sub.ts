import type { Priority } from "@trellis/api";
import { defineCommand } from "citty";
import { clientOf } from "../client.ts";
import { compact, contextOf, readText } from "../context.ts";
import { labelRefs } from "../flags.ts";
import { printRecord, ticketRecord } from "../output.ts";
import { labelFlag, priorities } from "./create.ts";

// The sub-ticket lands in the parent's project unless -p names another.
export default defineCommand({
	meta: {
		name: "sub",
		description:
			"Create a sub-ticket with an epic and a wave. The parent does not supply these selections. " +
			"Projects without epics receive a Default epic and wave. A selected epic without waves receives a Default wave. " +
			"Omitted selections reuse defaults only when they are the sole choices. All other choices require explicit selection.",
	},
	args: {
		ticket: { type: "positional", required: true, description: "Parent ticket ref" },
		title: { type: "string", alias: "t", required: true, description: "Title" },
		description: { type: "string", alias: "d", description: "Description text, or - for stdin" },
		priority: { type: "enum", options: [...priorities], description: "Priority" },
		status: { type: "string", description: "Status ref" },
		epic: {
			type: "string",
			description: "Epic ref; select it unless --wave supplies it or the server can use the default",
		},
		wave: {
			type: "string",
			description:
				"Wave ref; it selects the epic and must match --epic and --project. Use an existing wave or the default",
		},
		project: { type: "string", alias: "p", description: "Project ref; the parent's project when absent" },
		label: labelFlag,
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const client = clientOf(ctx);
		const project = args.project ?? (await client.tickets.get({ ticket: args.ticket })).project.key;
		const ticket = await client.tickets.create(
			compact({
				project,
				parent: args.ticket,
				title: args.title,
				description: args.description === undefined ? undefined : await readText(ctx, args.description),
				priority: args.priority as Priority | undefined,
				status: args.status,
				epic: args.epic,
				wave: args.wave,
				labels: labelRefs(context.rawArgs, "label"),
			}),
		);
		printRecord(ctx.out, ctx.format, ticket, ticketRecord);
	},
});
