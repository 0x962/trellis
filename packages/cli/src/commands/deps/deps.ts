import type { Ticket, TicketPr } from "@trellis/api";
import { defineCommand } from "citty";
import { clientOf } from "../../client.ts";
import { contextOf } from "../../context.ts";
import { json } from "../../output.ts";
import { type DepsResult, depsText } from "./depsText.ts";

type DependencyTicket = Omit<Ticket, "prRows"> & {
	waitsOn: DepsResult["waitsOn"];
	releases: DepsResult["releases"];
	prRows: Array<
		TicketPr & {
			stackedOn: DepsResult["derived"][number]["stackedOn"] | null;
		}
	>;
};

const depsResult = (ticket: DependencyTicket): DepsResult => ({
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
		const ticket = (await clientOf(ctx).tickets.get({ ticket: context.args.ticket })) as DependencyTicket;
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
