import { defineCommand } from "citty";
import { clientOf } from "../../client.ts";
import { contextOf } from "../../context.ts";
import { printRecord } from "../../output.ts";
import { pageRecord } from "./pageText.ts";

export const watch = defineCommand({
	meta: { name: "watch", description: "Assign an agent to receive human Page comments" },
	args: {
		page: { type: "positional", required: true, description: "Page ref" },
		agent: { type: "string", required: true, description: "Assigned agent ID" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const page = await clientOf(ctx).pages.watch({ page: context.args.page, agentId: context.args.agent });
		printRecord(ctx.out, ctx.format, page, pageRecord);
	},
});

export const unwatch = defineCommand({
	meta: { name: "unwatch", description: "Remove the Page watcher" },
	args: { page: { type: "positional", required: true, description: "Page ref" } },
	async run(context) {
		const ctx = contextOf(context);
		const page = await clientOf(ctx).pages.watch({ page: context.args.page, agentId: null });
		printRecord(ctx.out, ctx.format, page, pageRecord);
	},
});
