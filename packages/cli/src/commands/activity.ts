import { defineCommand } from "citty";
import { activityPages } from "../activity.ts";
import { clientOf } from "../client.ts";
import { contextOf } from "../context.ts";
import { usageError } from "../errors.ts";
import { printListPages } from "../output.ts";
import { activityList } from "../timeline.ts";

const positiveInteger = /^[1-9][0-9]*$/;

// The contract has no project activity procedure, so the command declares no
// `--project` flag, and `checkFlags` refuses it with exit 2.
export default defineCommand({
	meta: { name: "activity", description: "List the activity of a ticket" },
	args: {
		ticket: { type: "positional", required: false, description: "Ticket ref" },
		limit: { type: "string", default: "100", description: "Rows to print; pages follow cursors up to it" },
		all: { type: "boolean", description: "Every row, streamed page by page" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		if (args.ticket === undefined) throw usageError("activity needs a ticket ref");
		const parsedLimit = Number(args.limit);
		if (args.all !== true && (!positiveInteger.test(args.limit) || !Number.isSafeInteger(parsedLimit))) {
			throw usageError(`--limit needs a positive integer, not "${args.limit}"`);
		}
		const want = args.all === true ? Number.POSITIVE_INFINITY : parsedLimit;
		const client = clientOf(ctx);
		await printListPages(
			ctx.out,
			ctx.format,
			activityPages(args.ticket, want, (input) => client.timeline.list(input)),
			activityList,
		);
	},
});
