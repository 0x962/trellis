import type { Ticket } from "@trellis/api";
import { defineCommand } from "citty";
import { clientOf } from "../../client.ts";
import { contextOf } from "../../context.ts";
import { json } from "../../output.ts";
import { type DepsResult, depsText } from "./depsText.ts";

const depsResult = (ticket: Ticket): DepsResult => ({
	ticket: { identifier: ticket.identifier, title: ticket.title },
	waitsOn: ticket.waitsOn,
	releases: ticket.releases,
	derived: ticket.prRows.flatMap((pr) =>
		pr.stackedOn === null ? [] : [{ number: pr.number, baseRef: pr.baseRef, stackedOn: pr.stackedOn }],
	),
});

export default defineCommand({
	meta: { name: "deps", description: "Show what a ticket waits on and releases" },
	args: { ticket: { type: "positional", required: true, description: "Ticket ref" } },
	async run(context) {
		const ctx = contextOf(context);
		const ticket = await clientOf(ctx).tickets.get({ ticket: context.args.ticket });
		const result = depsResult(ticket);
		if (ctx.format.mode === "quiet") {
			ctx.out.write(`${result.ticket.identifier}\n`);
			return;
		}
		if (ctx.format.mode === "json" || ctx.format.mode === "jsonl") {
			ctx.out.write(json(result));
			return;
		}
		ctx.out.write(depsText(result));
	},
});
