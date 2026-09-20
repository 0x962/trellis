import {
	answerCommentBody,
	type QuestionOption,
	readQuestionDescription,
	TicketAnswerInputSchema,
	type TicketAnswerOutput,
} from "@trellis/api";
import type { ServiceCtx } from "../../context.ts";
import { statusById } from "../../db/queries/statusById.ts";
import type { Tx } from "../../db/tx.ts";
import { invalidInput } from "../../errors.ts";
import { create as writeComment } from "../comments.ts";
import { assertProjectActive, resolveTicket, type TicketRow } from "../refs.ts";
import { enqueueAnswerDeliveries } from "../reviews/enqueueAnswerDeliveries.ts";
import { move } from "./move.ts";
import { assertVersion } from "./rules.ts";

// A ticket asks a question when a person must review it and its description
// opens with an option list. `apps/server/src/db/queries/ticketSummary.ts`
// runs the same rule in SQL for the `isQuestion` field of a ticket summary,
// and the two must agree.
const questionOpening = /^Options:\s*\S/;

// What a person reads when the number they sent is not on the list.
const optionRefusal = (options: QuestionOption[]) =>
	options.length === 0
		? "This question numbers no option. Ask its author to write the option list."
		: `This question lists options ${options.map((option) => option.number).join(", ")}. Pick one of them.`;

const assertQuestion = async (tx: Tx, ticket: TicketRow, option: number) => {
	const status = await statusById(tx, ticket.statusId);
	if (status.reviewer !== "human" || !questionOpening.test(ticket.description))
		throw invalidInput(
			"ticket",
			"This ticket asks no question. A question waits for a person and opens its description with an option list.",
		);
	// `readQuestionDescription` reads the option list here and on the ticket
	// page, so the page prints the same options that this write accepts. The
	// test is membership and not size: a description that numbers its options
	// 1, 2 and 5 accepts 5 and refuses 3.
	const options = readQuestionDescription(ticket.description).options;
	if (!options.some((listed) => listed.number === option)) throw invalidInput("option", optionRefusal(options));
};

// Answers a question ticket. The answer becomes a comment on the question,
// the question moves to the done category, and each running agent that waits
// for the question gets a row in `review_deliveries`. The delivery loop sends
// those rows; this write only queues them.
export const answer = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<TicketAnswerOutput> => {
	const input = TicketAnswerInputSchema.parse(rawInput);
	const question = await resolveTicket(ctx, tx, input.ticket);
	assertProjectActive(ctx, question.projectId);
	await assertVersion(tx, question, input.expectedVersion);
	await assertQuestion(tx, question, input.option);
	const comment = await writeComment(ctx, tx, {
		ticket: question.id,
		body: answerCommentBody(input.option, input.reason),
	});
	const ticket = await move(ctx, tx, { ticket: question.id, status: "category:done" });
	const deliveries = await enqueueAnswerDeliveries(tx, { commentId: comment.id, questionId: question.id });
	return { ticket, commentId: comment.id, deliveries };
};
