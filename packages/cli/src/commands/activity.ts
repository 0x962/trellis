import type { TimelineItem, TimelineListInput, TimelineListOutput } from "@trellis/api";
import { defineCommand } from "citty";
import { clientOf } from "../client.ts";
import { compact, contextOf } from "../context.ts";
import { usageError } from "../errors.ts";
import { printListPages } from "../output.ts";
import { activityList } from "../timeline.ts";

const pageMax = 100;
const positiveInteger = /^[1-9][0-9]*$/;

export const activityPages = async function* (
	ticket: string,
	want: number,
	read: (input: TimelineListInput) => Promise<TimelineListOutput>,
): AsyncGenerator<TimelineItem[]> {
	let before: string | undefined;
	let taken = 0;
	while (taken < want) {
		const page = await read(compact({ ticket, before, limit: Math.min(want - taken, pageMax) }));
		taken += page.items.length;
		yield page.items;
		if (page.nextCursor === null) return;
		before = page.nextCursor;
	}
};

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
		if (args.all !== true && !positiveInteger.test(args.limit)) {
			throw usageError(`--limit needs a positive integer, not "${args.limit}"`);
		}
		const want = args.all === true ? Number.POSITIVE_INFINITY : Number(args.limit);
		const client = clientOf(ctx);
		await printListPages(
			ctx.out,
			ctx.format,
			activityPages(args.ticket, want, (input) => client.timeline.list(input)),
			activityList,
		);
	},
});
