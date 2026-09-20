import { TicketAnswerInputSchema, type TicketAnswerOutput } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { create as writeComment } from "../comments.ts";
import { assertProjectActive, resolveTicket } from "../refs.ts";
import { move } from "./move.ts";
import { assertVersion } from "./rules.ts";

type Recipient = { runId: string; agentName: string; ticket: string };

// The one line the agent brief reads. The option number comes before the
// reason, so a reader who scans the brief sees the choice first.
const answerBody = (option: number, reason: string) => `Answer: option ${option}. ${reason}`;

// The agents that still work on the tickets which wait for this question.
// `agent_runs` holds one open row per ticket for a run of kind `agent`, so
// each waiting ticket gives one recipient at most.
const recipientsOf = (tx: Tx, questionId: string) =>
	rows<Recipient>(
		tx,
		sql`SELECT run.id AS "runId", run.name AS "agentName", root.key || '-' || waiting.number AS ticket
		FROM ticket_deps dependency
		JOIN tickets waiting ON waiting.id = dependency.ticket_id
		JOIN projects root ON root.id = waiting.root_id
		JOIN agent_runs run ON run.ticket_id = waiting.id
		WHERE dependency.depends_on_id = ${questionId}
			AND run.kind = 'agent' AND run.runtime = 'native' AND run.closed_at IS NULL
		ORDER BY waiting.number, run.id`,
	);

// Answers a question ticket. The answer becomes a comment on the question,
// the question moves to the done category, and each running agent that waits
// for the question gets a row in `review_deliveries`. The delivery loop sends
// those rows; this write only queues them.
export const answer = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<TicketAnswerOutput> => {
	const input = TicketAnswerInputSchema.parse(rawInput);
	const question = await resolveTicket(ctx, tx, input.ticket);
	assertProjectActive(ctx, question.projectId);
	await assertVersion(tx, question, input.expectedVersion);
	const comment = await writeComment(ctx, tx, {
		ticket: question.id,
		body: answerBody(input.option, input.reason),
	});
	const ticket = await move(ctx, tx, { ticket: question.id, status: "category:done" });
	const deliveries = await recipientsOf(tx, question.id);
	for (const recipient of deliveries)
		await tx.execute(
			sql`INSERT INTO review_deliveries (id, answer_comment_id, run_id)
			VALUES (${ulid()}, ${comment.id}, ${recipient.runId})`,
		);
	return { ticket, commentId: comment.id, deliveries };
};
