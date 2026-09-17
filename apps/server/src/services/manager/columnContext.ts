import { sql } from "drizzle-orm";
import { iso, rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
export type ColumnContext = {
	ticket: { identifier: string; title: string; statusName: string; statusCategory: string };
	column: { count: number; limit: number | null };
	comments: { id: string; body: string; actorKind: string; actorDisplayName: string | null; createdAt: string }[];
};

export const columnContext = async (tx: Tx, candidate: { ticketId: string }): Promise<ColumnContext> => {
	const [ticket] = await rows<ColumnContext["ticket"]>(
		tx,
		sql`SELECT root.key || '-' || t.number AS identifier, t.title, s.name AS "statusName", s.category AS "statusCategory"
		FROM tickets t JOIN statuses s ON s.id = t.status_id JOIN projects root ON root.id = t.root_id WHERE t.id = ${candidate.ticketId}`,
	);
	const [fill] = await rows<{ count: number; limit: number | null }>(
		tx,
		sql`SELECT (SELECT count(*)::int FROM tickets WHERE status_id = t.status_id) AS count, s.wip_limit AS "limit"
		FROM tickets t JOIN statuses s ON s.id = t.status_id WHERE t.id = ${candidate.ticketId}`,
	);
	const comments = await rows<ColumnContext["comments"][number]>(
		tx,
		sql`SELECT c.id, c.body, c.actor_kind AS "actorKind", r.persona_name AS "actorDisplayName",
			${iso(sql`c.created_at`)} AS "createdAt"
		FROM comments c LEFT JOIN agent_runs r ON c.actor_kind = 'agent' AND r.id = c.actor_name
		WHERE c.ticket_id = ${candidate.ticketId} ORDER BY c.created_at DESC, c.id DESC LIMIT 5`,
	);
	return { ticket: ticket!, column: fill!, comments: comments.reverse() };
};
