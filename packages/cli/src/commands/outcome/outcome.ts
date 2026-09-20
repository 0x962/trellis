import { steCheck, type TicketOutcomeInput } from "@trellis/api";
import { defineCommand } from "citty";
import { clientOf } from "../../client.ts";
import { type CliContext, compact, contextOf, readText, toNumber, wantsJson } from "../../context.ts";
import { json } from "../../output.ts";

type SetArgs = {
	ticket: string;
	"expect-version"?: string;
};

export const outcomeInput = (args: SetArgs, text: string): TicketOutcomeInput =>
	compact({ ticket: args.ticket, outcome: text, expectedVersion: toNumber(args["expect-version"]) });

export const steLines = (text: string): { refusals: string[]; warnings: string[] } => {
	const report = steCheck(text, { headline: false });
	return {
		refusals: report.refusals.map((line) => `refused  ${line}`),
		warnings: report.warnings.map((line) => `warn     ${line}`),
	};
};

const printOutcome = (ctx: CliContext, ticket: { identifier: string; outcome: string }): void => {
	if (ctx.flags.quiet) {
		ctx.out.write(`${ticket.identifier}\n`);
		return;
	}
	if (wantsJson(ctx)) {
		ctx.out.write(json({ identifier: ticket.identifier, outcome: ticket.outcome }));
		return;
	}
	ctx.out.write(`${ticket.outcome}\n`);
};

const set = defineCommand({
	meta: { name: "set", description: "Set the outcome of a ticket" },
	args: {
		ticket: { type: "positional", required: true, description: "Ticket ref" },
		text: { type: "string", required: true, description: "One outcome sentence, or - for standard input" },
		"expect-version": { type: "string", description: "Fail unless the ticket is at this version" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const text = await readText(ctx, context.args.text);
		const report = steLines(text);
		const lines = [...report.refusals, ...report.warnings];
		if (lines.length > 0) ctx.err.write(`${lines.join("\n")}\n`);
		if (report.refusals.length > 0) return 4;
		const ticket = await clientOf(ctx).tickets.setOutcome(outcomeInput(context.args, text));
		printOutcome(ctx, ticket);
	},
});

const show = defineCommand({
	meta: { name: "show", description: "Show the outcome of a ticket" },
	args: { ticket: { type: "positional", required: true, description: "Ticket ref" } },
	async run(context) {
		const ctx = contextOf(context);
		const ticket = await clientOf(ctx).tickets.get({ ticket: context.args.ticket });
		printOutcome(ctx, ticket);
	},
});

export default defineCommand({
	meta: { name: "outcome", description: "Set or show the outcome of a ticket" },
	subCommands: { set, show },
});
