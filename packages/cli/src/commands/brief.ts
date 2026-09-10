import { defineCommand } from "citty";
import { clientOf } from "../client.ts";
import { contextOf, wantsJson } from "../context.ts";
import { json } from "../output.ts";

// The markdown is what an agent pipes into its context, so it prints
// verbatim on a TTY and on a pipe alike.
export default defineCommand({
	meta: { name: "brief", description: "Print the markdown brief of a ticket" },
	args: { ticket: { type: "positional", required: true, description: "Ticket ref" } },
	async run(context) {
		const ctx = contextOf(context);
		const result = await clientOf(ctx).brief.get({ ticket: context.args.ticket });
		if (wantsJson(ctx)) {
			ctx.out.write(json(result));
			return;
		}
		ctx.out.write(result.markdown);
	},
});
