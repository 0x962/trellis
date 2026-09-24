import { isAgentWorking } from "@trellis/api";
import { defineCommand } from "citty";
import { clientOf } from "../../client.ts";
import { contextOf } from "../../context.ts";
import { json } from "../../output.ts";
import { readyResultOf } from "../ready/ready.ts";
import { readyText } from "../ready/readyText.ts";

export default defineCommand({
	meta: { name: "show", description: "Read epic progress and work that can start" },
	args: { epic: { type: "positional", required: true, description: "Epic ID or PROJECT/epic-slug" } },
	async run(context) {
		const ctx = contextOf(context);
		const client = clientOf(ctx);
		const [epic, runs] = await Promise.all([
			client.epics.get({ epic: context.args.epic }),
			client.agentRuns.list({ assigned: true }),
		]);
		const working = new Set(
			runs.flatMap((run) =>
				run.kind === "agent" && run.ticketId !== null && isAgentWorking(run) ? [run.ticketId] : [],
			),
		);
		const result = readyResultOf(epic.tickets, working);
		if (ctx.format.mode === "quiet") {
			ctx.out.write(result.readyToStart.identifiers.join("\n") + (result.readyToStart.count ? "\n" : ""));
			return;
		}
		ctx.out.write(ctx.format.mode === "table" ? readyText(result) : json(result));
	},
});
