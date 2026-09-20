import { defineCommand } from "citty";
import { clientOf } from "../client.ts";
import { compact, contextOf, toNumber } from "../context.ts";
import { evidenceFloorMissing } from "../errors.ts";
import { printRecord, ticketRecord } from "../output.ts";
import { handOverGuard } from "./move/handOverGuard.ts";

export default defineCommand({
	meta: { name: "move", description: "Move a ticket to a status" },
	args: {
		ticket: { type: "positional", required: true, description: "Ticket ref" },
		status: { type: "positional", required: true, description: "Status ref: slug, name, or category:<category>" },
		after: { type: "string", description: "Place after this ticket in the column" },
		before: { type: "string", description: "Place before this ticket in the column" },
		"expect-version": { type: "string", description: "Fail unless the ticket is at this version" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const client = clientOf(ctx);
		const missing = await handOverGuard(client, ctx.actor().kind, args.ticket, args.status);
		if (missing !== null) {
			ctx.out.write(missing);
			throw evidenceFloorMissing(args.ticket);
		}
		const ticket = await client.tickets.move(
			compact({
				ticket: args.ticket,
				status: args.status,
				after: args.after,
				before: args.before,
				expectedVersion: toNumber(args["expect-version"]),
			}),
		);
		printRecord(ctx.out, ctx.format, ticket, ticketRecord);
	},
});
