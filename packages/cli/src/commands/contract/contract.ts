import type { TicketContractInput } from "@trellis/api";
import { defineCommand } from "citty";
import { clientOf } from "../../client.ts";
import { compact, contextOf, toNumber, wantsJson } from "../../context.ts";
import { repeatedFlag } from "../../flags.ts";
import { json } from "../../output.ts";
import { contractText, evidenceOwedText } from "./contractText.ts";

type SetArgs = {
	ticket: string;
	result: string;
	"expect-version"?: string;
};

export const contractInput = (rawArgs: string[], args: SetArgs): TicketContractInput =>
	compact({
		ticket: args.ticket,
		result: args.result,
		files: repeatedFlag(rawArgs, "file"),
		leaveAlone: repeatedFlag(rawArgs, "leave-alone"),
		verify: repeatedFlag(rawArgs, "verify"),
		reviewFocus: repeatedFlag(rawArgs, "focus"),
		expectedVersion: toNumber(args["expect-version"]),
	});

const printContract = (
	ctx: ReturnType<typeof contextOf>,
	ticket: { identifier: string; contract: Parameters<typeof contractText>[0] },
): void => {
	if (ctx.flags.quiet) {
		ctx.out.write(`${ticket.identifier}\n`);
		return;
	}
	if (wantsJson(ctx)) {
		ctx.out.write(json({ ...ticket.contract, evidenceOwed: evidenceOwedText(ticket.contract) }));
		return;
	}
	ctx.out.write(contractText(ticket.contract));
};

const set = defineCommand({
	meta: { name: "set", description: "Set the contract of a ticket" },
	args: {
		ticket: { type: "positional", required: true, description: "Ticket ref" },
		result: { type: "string", required: true, description: "Result of the work" },
		file: { type: "string", description: "File the work can change; repeat for each file" },
		"leave-alone": { type: "string", description: "File the work must not change; repeat for each file" },
		verify: { type: "string", description: "Verify command; repeat for each command" },
		focus: { type: "string", description: "Review focus; repeat for each sentence" },
		"expect-version": { type: "string", description: "Fail unless the ticket is at this version" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const ticket = await clientOf(ctx).tickets.setContract(contractInput(context.rawArgs, context.args));
		printContract(ctx, ticket);
	},
});

const show = defineCommand({
	meta: { name: "show", description: "Show the contract of a ticket" },
	args: { ticket: { type: "positional", required: true, description: "Ticket ref" } },
	async run(context) {
		const ctx = contextOf(context);
		const ticket = await clientOf(ctx).tickets.get({ ticket: context.args.ticket });
		printContract(ctx, ticket);
	},
});

export default defineCommand({
	meta: { name: "contract", description: "Set or show the contract of a ticket" },
	subCommands: { set, show },
});
