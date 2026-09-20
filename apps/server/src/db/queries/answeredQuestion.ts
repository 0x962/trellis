import { answerOptionPattern } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { Tx } from "../tx.ts";
import { questionDescription, rows } from "./support.ts";

export type AnsweredQuestionRow = {
	identifier: string;
	title: string;
	option: number;
};

// The questions that this ticket waited for, after somebody answered them.
// `waitsOn` drops a ticket that is done, so the ticket page cannot read them
// there.
//
// `ticketQuestion` asks for a human reviewer, and a done status has no
// reviewer, so that test cannot run here. Two tests replace it. The
// description still starts with an option list, and a person wrote a comment
// that `answerCommentBody` shapes. Only `apps/server/src/services/tickets/
// answer.ts` writes that comment, and it refuses a ticket that no person
// reviews.
//
// The author test costs one case: an answer that an agent sent through
// `trellis answer` prints no line here. A `ticket_answers` row, Decision 4 of
// the epic, ends the guessing and takes both tests away.
export const answeredQuestions = (tx: Tx, ticketId: string): Promise<AnsweredQuestionRow[]> =>
	rows<AnsweredQuestionRow>(
		tx,
		sql`SELECT question_root.key || '-' || question.number AS identifier, question.title,
			(regexp_match(answer.body, ${answerOptionPattern}))[1]::int AS option
		FROM ticket_deps dependency
		JOIN tickets question ON question.id = dependency.depends_on_id
		JOIN statuses question_status ON question_status.id = question.status_id
		JOIN projects question_root ON question_root.id = question.root_id
		JOIN LATERAL (
			SELECT body FROM comments
			WHERE comments.ticket_id = question.id
				AND comments.actor_kind = 'human'
				AND comments.body ~ ${answerOptionPattern}
			ORDER BY comments.created_at DESC, comments.id DESC
			LIMIT 1
		) answer ON true
		WHERE dependency.ticket_id = ${ticketId}
			AND question_status.category = 'done'
			AND ${questionDescription(sql`question`)}
		ORDER BY question.number, question.id`,
	);
