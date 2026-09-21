import { defineCommand } from "citty";
import { clientOf } from "../client.ts";
import { compact, contextOf, toNumber } from "../context.ts";
import { usageError } from "../errors.ts";
import { printList } from "../output.ts";
import { activityList } from "../timeline.ts";

// The contract has no project activity procedure, so the command declares no
// `--project` flag, and `checkFlags` refuses it with exit 2.
export default defineCommand({
	meta: { name: "activity", description: "List the activity of a ticket" },
	args: {
		ticket: { type: "positional", required: false, description: "Ticket ref" },
		limit: { type: "string", description: "Timeline rows to read, at most 100" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		if (args.ticket === undefined) throw usageError("activity needs a ticket ref");
		const page = await clientOf(ctx).timeline.list(compact({ ticket: args.ticket, limit: toNumber(args.limit) }));
		printList(ctx.out, ctx.format, page.items, activityList);
	},
});
