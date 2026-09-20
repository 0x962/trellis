import type { TicketAnswerInput, TicketAnswerOutput } from "@trellis/api";
import { defineCommand } from "citty";
import { clientOf } from "../../client.ts";
import { contextOf } from "../../context.ts";
import { json } from "../../output.ts";
import { type AnswerResult, answerText } from "./answerText.ts";

type AnswerArgs = {
	ticket: string;
	option: string;
	reason: string;
};

const answerInput = (args: AnswerArgs): TicketAnswerInput => ({
	ticket: args.ticket,
	option: Number(args.option),
	reason: args.reason,
});

const answerResult = (result: TicketAnswerOutput, option: number): AnswerResult => ({
	...result,
	option,
});

export default defineCommand({
	meta: { name: "answer", description: "Answer a question ticket" },
	args: {
		ticket: { type: "positional", required: true, description: "Question ticket ref" },
		option: { type: "string", required: true, description: "Number of the selected option" },
		reason: { type: "string", required: true, description: "Reason for the answer" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const input = answerInput(context.args);
		const result = answerResult(await clientOf(ctx).tickets.answer(input), input.option);
		if (ctx.flags.quiet) {
			ctx.out.write(`${result.ticket.identifier}\n`);
			return;
		}
		ctx.out.write(ctx.format.mode === "table" ? answerText(result) : json(result));
	},
});
