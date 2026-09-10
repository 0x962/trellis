import { defineCommand } from "citty";
import { clientOf } from "../client.ts";
import { compact, contextOf, toNumber } from "../context.ts";
import { usageError } from "../errors.ts";
import { printList } from "../output.ts";
import { activityItems, activityList } from "../timeline.ts";

// The contract has no project activity procedure, so `--project` is a stub.
export default defineCommand({
	meta: { name: "activity", description: "List the activity of a ticket" },
	args: {
		ticket: { type: "positional", required: false, description: "Ticket ref" },
		project: { type: "string", description: "Project ref (not yet)" },
		limit: { type: "string", description: "Timeline rows to read, at most 100" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		if (args.project !== undefined) {
			ctx.out.write("activity --project: not yet\n");
			return;
		}
		if (args.ticket === undefined) throw usageError("activity needs a ticket ref or --project");
		const page = await clientOf(ctx).timeline.list(compact({ ticket: args.ticket, limit: toNumber(args.limit) }));
		printList(ctx.out, ctx.format, activityItems(page.items), activityList);
	},
});
