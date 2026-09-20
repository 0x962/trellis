import { sql } from "drizzle-orm";
import type { Tx } from "../tx.ts";
import { questionDescription } from "./chainRows.ts";
import { rows } from "./support.ts";

export type AnsweredQuestionRow = {
	identifier: string;
	title: string;
	option: number;
};

// The comment that `apps/server/src/services/tickets/answer.ts` writes, and
// the number inside it. The two patterns must stay the same shape: the
// service writes `Answer: option 1. <reason>` and this query reads the `1`.
const answerBody = sql`'^Answer: option [0-9]+\.'`;
const answerOption = sql`(regexp_match(answer.body, '^Answer: option ([0-9]+)\.'))[1]::int`;

// The question that a ticket waited for and that somebody has answered. The
// ticket page prints it under `Applies`, so a person who opens the released
// ticket reads which option was picked.
//
// A ticket summary leaves out a dependency that is done, so the answered
// question is not in `waitsOn` any more. This query reads it again, and only
// on the page of one ticket.
//
// A done status carries no reviewer, so the human-reviewer half of the
// question rule cannot hold here. The answer comment stands in its place:
// only `answer.ts` writes that comment, and it refuses a ticket that a
// person does not review.
export const answeredQuestion = async (tx: Tx, ticketId: string): Promise<AnsweredQuestionRow | null> => {
	const found = await rows<AnsweredQuestionRow>(
		tx,
		sql`SELECT question_root.key || '-' || question.number AS identifier, question.title, ${answerOption} AS option
		FROM ticket_deps dependency
		JOIN tickets question ON question.id = dependency.depends_on_id
		JOIN statuses question_status ON question_status.id = question.status_id
		JOIN projects question_root ON question_root.id = question.root_id
		JOIN LATERAL (
			SELECT body FROM comments
			WHERE comments.ticket_id = question.id AND comments.body ~ ${answerBody}
			ORDER BY comments.created_at DESC, comments.id DESC
			LIMIT 1
		) answer ON true
		WHERE dependency.ticket_id = ${ticketId}
			AND question_status.category = 'done'
			AND ${questionDescription(sql`question`)}
		ORDER BY question.number DESC, question.id DESC
		LIMIT 1`,
	);
	return found[0] ?? null;
};
