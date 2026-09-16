import type { ManagerWait } from "@trellis/api/contract";
import { sql } from "drizzle-orm";
import { rows } from "../../../db/queries/support.ts";
import type { Tx } from "../../../db/tx.ts";

export const conditionMet = async (tx: Tx, input: { waitFor: ManagerWait; ticketId: string; now: Date }) => {
	const wait = input.waitFor;
	if (wait.type === "time") return input.now.getTime() >= new Date(wait.at).getTime();
	if (wait.type === "dependency") {
		const [ticket] = await rows(
			tx,
			sql`SELECT t.id FROM tickets t JOIN statuses s ON s.id=t.status_id
			WHERE t.id=${wait.ticketId} AND t.completed_at IS NOT NULL AND s.category='done'`,
		);
		return ticket !== undefined;
	}
	const [reply] = await rows(
		tx,
		sql`SELECT c.id FROM comments c JOIN comments question ON question.id=c.parent_id
		WHERE question.id=${wait.commentId} AND question.ticket_id=${input.ticketId} AND question.parent_id IS NULL
		AND c.actor_kind='human' LIMIT 1`,
	);
	return reply !== undefined;
};
