import type { TicketAnswerInput } from "@trellis/api";
import { defineCommand } from "citty";
import { clientOf } from "../../client.ts";
import { type CliContext, contextOf, readText } from "../../context.ts";
import { usageError } from "../../errors.ts";
import { json } from "../../output.ts";
import { type AnswerResult, answerText } from "./answerText.ts";

type AnswerArgs = {
	ticket: string;
	option: string;
	reason: string;
};

const optionNumber = (value: string): number => {
	if (!/^\d+$/.test(value)) throw usageError("--option needs an integer");
	return Number(value);
};

export const answerInput = async (ctx: CliContext, args: AnswerArgs): Promise<TicketAnswerInput> => ({
	ticket: args.ticket,
	option: optionNumber(args.option),
	reason: await readText(ctx, args.reason),
});

export default defineCommand({
	meta: { name: "answer", description: "Answer a question ticket" },
	args: {
		ticket: { type: "positional", required: true, description: "Question ticket ref" },
		option: { type: "string", required: true, description: "Number of the selected option" },
		reason: { type: "string", required: true, description: "Reason for the answer, or - for standard input" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const input = await answerInput(ctx, context.args);
		const result: AnswerResult = { ...(await clientOf(ctx).tickets.answer(input)), option: input.option };
		if (ctx.flags.quiet) {
			ctx.out.write(`${result.ticket.identifier}\n`);
			return;
		}
		ctx.out.write(ctx.format.mode === "table" ? answerText(result) : json(result));
	},
});
