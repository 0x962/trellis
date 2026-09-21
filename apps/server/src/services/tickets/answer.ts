import {
	asksQuestion,
	type QuestionOption,
	readQuestionDescription,
	TicketAnswerInputSchema,
	type TicketAnswerOutput,
} from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { requireActor, type ServiceCtx } from "../../context.ts";
import { statusById } from "../../db/queries/statusById.ts";
import type { Tx } from "../../db/tx.ts";
import { invalidInput } from "../../errors.ts";
import { record } from "../activity.ts";
import { assertProjectActive, resolveTicket, type TicketRow } from "../refs.ts";
import { enqueueAnswerDeliveries } from "../reviews/enqueueAnswerDeliveries.ts";
import { move } from "./move.ts";
import { assertVersion } from "./rules.ts";

// What a person reads when the number they sent is not on the list.
const optionRefusal = (options: QuestionOption[]) =>
	options.length === 0
		? "This question numbers no option. Ask its author to write the option list."
		: `This question lists options ${options.map((option) => option.number).join(", ")}. Pick one of them.`;

const assertQuestion = async (tx: Tx, ticket: TicketRow, option: number) => {
	const status = await statusById(tx, ticket.statusId);
	if (!asksQuestion(status.reviewer, ticket.description))
		throw invalidInput(
			"ticket",
			"This ticket asks no question. A question waits for a person and contains an option list.",
		);
	// `readQuestionDescription` reads the option list here and on the ticket
	// page, so the page prints the same options that this write accepts. The
	// test is membership and not size: a description that numbers its options
	// 1, 2 and 5 accepts 5 and refuses 3.
	const options = readQuestionDescription(ticket.description).options;
	if (!options.some((listed) => listed.number === option)) throw invalidInput("option", optionRefusal(options));
};

// Answers a question ticket. The answer becomes a `ticket_answers` row and an
// activity row on the question, the question moves to the done category, and
// each running agent that waits for the question gets a row in
// `review_deliveries`. The delivery loop sends those rows; this write only
// queues them. `record` writes the actor row that the answer row points at, so
// it runs before the insert.
export const answer = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<TicketAnswerOutput> => {
	const input = TicketAnswerInputSchema.parse(rawInput);
	const question = await resolveTicket(ctx, tx, input.ticket);
	assertProjectActive(ctx, question.projectId);
	await assertVersion(tx, question, input.expectedVersion);
	await assertQuestion(tx, question, input.option);
	const actor = requireActor(ctx);
	const answerId = ulid();
	await record(ctx, tx, {
		rootId: question.rootId,
		projectId: question.projectId,
		ticketId: question.id,
		action: "ticket.answered",
		changes: [{ field: null, from: null, to: null, meta: { answerId, option: input.option } }],
	});
	await tx.execute(
		sql`INSERT INTO ticket_answers (id, ticket_id, option, reason, actor_name, actor_kind, created_at)
			VALUES (${answerId}, ${question.id}, ${input.option}, ${input.reason}, ${actor.name}, ${actor.kind}, ${ctx.now})`,
	);
	const ticket = await move(ctx, tx, { ticket: question.id, status: "category:done" });
	const deliveries = await enqueueAnswerDeliveries(tx, { answerId, questionId: question.id });
	return { ticket, answerId, deliveries };
};
