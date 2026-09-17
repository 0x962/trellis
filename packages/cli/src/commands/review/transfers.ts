import { defineCommand } from "citty";
import { clientOf } from "../../client";
import { contextOf } from "../../context";
import { json } from "../../output";

export const transfer = defineCommand({
	args: { pr: { type: "positional", required: true } },
	async run(c) {
		const ctx = contextOf(c);
		ctx.out.write(json(await clientOf(ctx).reviews.export({ pr: c.args.pr })));
	},
});
