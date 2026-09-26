import type { Priority } from "@trellis/api";
import { defineCommand } from "citty";
import { clientOf } from "../client.ts";
import { compact, contextOf, readText } from "../context.ts";
import { labelRefs, repeatedFlag } from "../flags.ts";
import { printRecord, ticketRecord } from "../output.ts";

export const priorities = ["none", "urgent", "high", "medium", "low"] as const;

// The shape of a flag that names labels of one ticket: `--label` here and on
// `sub`, `--add-label` and `--remove-label` on `edit`. The caller repeats the
// flag, or writes several refs with a comma between them.
export const labelFlag = {
	type: "string",
	description: "Label ref: a ULID, a name, or group/name; repeat it or separate refs with commas",
} as const;

export default defineCommand({
	meta: {
		name: "create",
		description:
			"Create a ticket with an epic and a wave. Projects without epics receive a Default epic and wave. " +
			"A selected epic without waves receives a Default wave. Omitted selections reuse defaults only when they are the sole choices. " +
			"All other choices require explicit selection.",
	},
	args: {
		project: { type: "string", alias: "p", required: true, description: "Project ref" },
		title: { type: "string", alias: "t", required: true, description: "Title" },
		description: { type: "string", alias: "d", description: "Description text, or - for stdin" },
		priority: { type: "enum", options: [...priorities], description: "Priority" },
		status: { type: "string", description: "Status ref; the project default when absent" },
		parent: { type: "string", description: "Parent ticket ref" },
		epic: {
			type: "string",
			description: "Epic ref; select it unless --wave supplies it or the server can use the default",
		},
		wave: {
			type: "string",
			description:
				"Wave ref; it selects the epic and must match --epic and --project. Use an existing wave or the default",
		},
		after: { type: "string", description: "Ticket ref to wait for; repeat for more tickets" },
		label: labelFlag,
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const after = repeatedFlag(context.rawArgs, "after");
		const ticket = await clientOf(ctx).tickets.create(
			compact({
				project: args.project,
				title: args.title,
				description: args.description === undefined ? undefined : await readText(ctx, args.description),
				priority: args.priority as Priority | undefined,
				status: args.status,
				parent: args.parent,
				epic: args.epic,
				wave: args.wave,
				labels: labelRefs(context.rawArgs, "label"),
				after: after.length === 0 ? undefined : after,
			}),
		);
		printRecord(ctx.out, ctx.format, ticket, ticketRecord);
	},
});
