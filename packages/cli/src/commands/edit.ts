import type { Priority } from "@trellis/api";
import { defineCommand } from "citty";
import { clientOf } from "../client.ts";
import { compact, contextOf, noneToNull, readText, toNumber } from "../context.ts";
import { labelRefs, repeatedFlag } from "../flags.ts";
import { printRecord, ticketRecord } from "../output.ts";
import { labelFlag, priorities } from "./create.ts";

export default defineCommand({
	meta: { name: "edit", description: "Change ticket fields" },
	args: {
		ticket: { type: "positional", required: true, description: "Ticket ref" },
		title: { type: "string", description: "New title" },
		description: { type: "string", description: "New description, or - for stdin" },
		priority: { type: "enum", options: [...priorities], description: "New priority" },
		parent: { type: "string", description: "New parent ref, or none to clear it" },
		epic: { type: "string", description: "New epic ref, or none to clear it" },
		milestone: { type: "string", description: "New milestone ref, or none to clear it; a ref also sets the epic" },
		project: { type: "string", description: "New project ref" },
		status: { type: "string", description: "New status ref" },
		after: { type: "string", description: "Ticket ref to wait for; repeat for more tickets" },
		"not-after": { type: "string", description: "Ticket ref to stop waiting for; repeat for more tickets" },
		"add-label": labelFlag,
		"remove-label": labelFlag,
		"expect-version": { type: "string", description: "Fail unless the ticket is at this version" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const client = clientOf(ctx);
		const after = repeatedFlag(context.rawArgs, "after");
		const notAfter = repeatedFlag(context.rawArgs, "not-after");
		const expectedVersion = toNumber(args["expect-version"]);
		let ticket =
			after.length === 0 && notAfter.length === 0
				? undefined
				: await client.tickets.updateDependencies(
						compact({
							ticket: args.ticket,
							after: after.length === 0 ? undefined : after,
							notAfter: notAfter.length === 0 ? undefined : notAfter,
							expectedVersion,
						}),
					);
		const fields = compact({
			ticket: args.ticket,
			title: args.title,
			description: args.description === undefined ? undefined : await readText(ctx, args.description),
			priority: args.priority as Priority | undefined,
			parent: noneToNull(args.parent),
			epic: noneToNull(args.epic),
			milestone: noneToNull(args.milestone),
			project: args.project,
			status: args.status,
			addLabels: labelRefs(context.rawArgs, "add-label"),
			removeLabels: labelRefs(context.rawArgs, "remove-label"),
		});
		// `fields` always holds `ticket`, so a second key means the command changes
		// a ticket field. With no dependency or field change, `tickets.update` reads
		// the ticket for output. When both calls run, `tickets.update` uses the version
		// that `tickets.updateDependencies` returned.
		if (Object.keys(fields).length > 1 || ticket === undefined)
			ticket = await client.tickets.update(compact({ ...fields, expectedVersion: ticket?.version ?? expectedVersion }));
		printRecord(ctx.out, ctx.format, ticket, ticketRecord);
	},
});
