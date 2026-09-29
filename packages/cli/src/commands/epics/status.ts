import { defineCommand } from "citty";
import { clientOf } from "../../client.ts";
import { contextOf } from "../../context.ts";
import { json } from "../../output.ts";
import { readyResultOf } from "../ready/ready.ts";
import { readyText } from "../ready/readyText.ts";
import { workingTicketIds } from "../workingTicketIds/index.ts";

export default defineCommand({
	meta: { name: "show", description: "Read epic progress and work that can start" },
	args: { epic: { type: "positional", required: true, description: "Epic ID or PROJECT/epic-slug" } },
	async run(context) {
		const ctx = contextOf(context);
		const client = clientOf(ctx);
		const [epic, working] = await Promise.all([
			client.epics.get({ epic: context.args.epic }),
			workingTicketIds(client, context.args.epic),
		]);
		const result = readyResultOf(epic.tickets, working);
		if (ctx.format.mode === "quiet") {
			ctx.out.write(result.readyToStart.identifiers.join("\n") + (result.readyToStart.count ? "\n" : ""));
			return;
		}
		ctx.out.write(ctx.format.mode === "table" ? readyText(result) : json(result));
	},
});
