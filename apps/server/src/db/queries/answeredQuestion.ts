import type { TicketAnswer } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { Tx } from "../tx.ts";
import { actorDisplayName } from "./actorDisplayName.ts";
import { iso, questionDescription, rows } from "./support.ts";

export type AnsweredQuestionRow = {
	identifier: string;
	title: string;
	option: number;
};

// The questions that this ticket waited for, after somebody answered them,
// each with the option of its newest answer. `waitsOn` drops a ticket that
// is done, so the ticket page cannot read them there. Only
// `apps/server/src/services/tickets/answer.ts` writes a `ticket_answers` row,
// and it moves the question to done in the same transaction.
export const answeredQuestions = (tx: Tx, ticketId: string): Promise<AnsweredQuestionRow[]> =>
	rows<AnsweredQuestionRow>(
		tx,
		sql`SELECT question_root.key || '-' || question.number AS identifier, question.title, answer.option
		FROM ticket_deps dependency
		JOIN tickets question ON question.id = dependency.depends_on_id
		JOIN statuses question_status ON question_status.id = question.status_id
		JOIN projects question_root ON question_root.id = question.root_id
		JOIN LATERAL (
			SELECT option FROM ticket_answers
			WHERE ticket_answers.ticket_id = question.id
			ORDER BY ticket_answers.created_at DESC, ticket_answers.id DESC
			LIMIT 1
		) answer ON true
		WHERE dependency.ticket_id = ${ticketId}
			AND question_status.category = 'done'
			AND ${questionDescription(sql`question`)}
		ORDER BY question.number, question.id`,
	);

type AnswerRow = {
	option: number;
	reason: string;
	actor_name: string;
	actor_kind: TicketAnswer["actor"]["kind"];
	actor_display_name: string | null;
	created_at: string;
};

// The newest answer of the question ticket `ticketId`, or null for a ticket
// that nobody answered.
export const ticketAnswer = async (tx: Tx, ticketId: string): Promise<TicketAnswer | null> => {
	const [row] = await rows<AnswerRow>(
		tx,
		sql`SELECT option, reason, actor_name, actor_kind,
			${actorDisplayName(sql`ticket_answers.actor_name`, sql`ticket_answers.actor_kind`)} AS actor_display_name,
			${iso(sql`created_at`)} AS created_at
		FROM ticket_answers WHERE ticket_id = ${ticketId}
		ORDER BY created_at DESC, id DESC LIMIT 1`,
	);
	if (row === undefined) return null;
	return {
		option: row.option,
		reason: row.reason,
		actor: {
			name: row.actor_name,
			kind: row.actor_kind,
			...(row.actor_display_name === null ? {} : { displayName: row.actor_display_name }),
		},
		createdAt: row.created_at,
	};
};
