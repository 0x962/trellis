import { HarnessPresetSchema } from "@trellis/api";
import { defineCommand } from "citty";
import { clientOf } from "../../client.ts";
import { compact, contextOf } from "../../context.ts";
import { printList } from "../../output.ts";

export default defineCommand({
	meta: { name: "models", description: "List canonical models for agent assignments" },
	subCommands: {
		list: defineCommand({
			meta: { name: "list", description: "List canonical model IDs" },
			args: { harness: { type: "string", description: "claude, codex, pi, opencode, muse, or custom" } },
			async run(context) {
				const ctx = contextOf(context);
				const harness = HarnessPresetSchema.optional().parse(context.args.harness);
				const models = await clientOf(ctx).models.list(compact({ harness }));
				printList(ctx.out, ctx.format, models, {
					columns: [
						{ name: "id", value: (row) => row.id },
						{ name: "name", value: (row) => row.name },
					],
					identifier: (row) => row.id,
				});
			},
		}),
	},
});
