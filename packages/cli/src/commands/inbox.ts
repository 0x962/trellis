import type { Inbox } from "@trellis/api";
import { defineCommand } from "citty";
import { clientOf } from "../client.ts";
import { compact, contextOf } from "../context.ts";
import { heading, json, printList, renderTable, ticketList } from "../output.ts";

const sections: Array<keyof Inbox> = ["review", "failingCi", "stalled", "doneByAgentsToday"];

export default defineCommand({
	meta: { name: "inbox", description: "Show what needs a human" },
	args: { project: { type: "string", description: "Project ref" } },
	async run(context) {
		const ctx = contextOf(context);
		const inbox = await clientOf(ctx).inbox.get(compact({ project: context.args.project }));
		switch (ctx.format.mode) {
			case "json":
			case "jsonl":
				ctx.out.write(json(inbox));
				return;
			case "quiet":
				for (const name of sections) printList(ctx.out, ctx.format, inbox[name].items, ticketList);
				return;
			case "table":
				for (const name of sections) {
					const section = inbox[name];
					ctx.out.write(
						`${heading(`${name} (${section.total})`, ctx.format.color)}${renderTable(section.items, ticketList.columns)}\n`,
					);
				}
				return;
		}
	},
});
