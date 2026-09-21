import { turnOf } from "@trellis/api";
import { sql } from "drizzle-orm";
import { iso, rows } from "../../db/queries/support.ts";
import { ticketSummaries } from "../../db/queries/ticketSummaries.ts";
import type { Tx } from "../../db/tx.ts";
import { mentionedNames } from "../commentMentions/mentioned.ts";

export type Candidate = {
	id: string;
	section: "review" | "mentioned";
	ticketId: string;
	receivedAt: string;
	snoozedUntil: string | null;
	ignored: boolean;
	comment: { id: string; threadId: string; body: string; actorName: string } | null;
	title: string;
	priority: string;
	createdAt: string;
	updatedAt: string;
	identifier: string;
};

export const candidates = async (
	tx: Tx,
	actor: string,
	workingTicketIds: ReadonlySet<string> = new Set(),
): Promise<Candidate[]> => {
	const found = await rows<Candidate>(
		tx,
		sql`
		WITH eligible AS (
			SELECT 'review:' || t.id || ':' || COALESCE(a.id::text, 'initial') AS id,
				'review' AS section, t.id AS ticket_id, COALESCE(a.created_at, t.created_at) AS received_at,
				NULL::jsonb AS comment
			FROM tickets t JOIN statuses s ON s.id=t.status_id
			LEFT JOIN LATERAL (SELECT id, created_at FROM activity WHERE ticket_id=t.id AND field='status' ORDER BY id DESC LIMIT 1) a ON true
			WHERE s.category NOT IN ('done', 'canceled') AND (
				s.reviewer='human' OR EXISTS (
					SELECT 1 FROM ticket_pull_requests link
					JOIN pull_requests pull_request ON pull_request.id=link.pull_request_id
					WHERE link.ticket_id=t.id AND pull_request.state='open'
				)
			)
			UNION ALL
			SELECT 'mentioned:' || c.id, 'mentioned', t.id, c.created_at,
				jsonb_build_object('id', c.id, 'threadId', COALESCE(c.parent_id,c.id), 'body',c.body,'actorName',COALESCE(run.name,c.actor_name))
			FROM comments c JOIN tickets t ON t.id=c.ticket_id
			JOIN comments root ON root.id=COALESCE(c.parent_id,c.id)
			LEFT JOIN agent_runs run ON c.actor_kind='agent' AND run.id=c.actor_name
			WHERE c.resolved_at IS NULL AND root.resolved_at IS NULL
				AND strpos(lower(c.body), ${`@${actor.toLowerCase()}`}) > 0
				AND NOT EXISTS (
					SELECT 1 FROM activity completed
					WHERE completed.ticket_id=t.id AND completed.field='status'
						AND completed.meta->>'toCategory'='done' AND completed.created_at > c.created_at
				)
		)
		SELECT e.id, e.section, e.ticket_id AS "ticketId", ${iso(sql`e.received_at`)} AS "receivedAt", e.comment,
			${iso(sql`state.snoozed_until`)} AS "snoozedUntil", COALESCE(state.ignored,false) AS ignored,
			t.title,t.priority,${iso(sql`t.created_at`)} AS "createdAt",${iso(sql`t.updated_at`)} AS "updatedAt",
			p.key || '-' || t.number AS identifier
		FROM eligible e JOIN tickets t ON t.id=e.ticket_id JOIN projects p ON p.id=t.root_id
		LEFT JOIN needs_you_states state ON state.item_id=e.id AND state.actor_name=${actor}
	`,
	);
	const reviewTickets = new Map(
		(
			await ticketSummaries(
				tx,
				found.filter((item) => item.section === "review").map((item) => item.ticketId),
			)
		).map((ticket) => [ticket.id, ticket]),
	);
	const names = await rows<{ name: string }>(tx, sql`SELECT name FROM actors WHERE kind='human'`);
	return found.filter(
		(item) =>
			(item.comment === null &&
				turnOf(reviewTickets.get(item.ticketId)!, workingTicketIds.has(item.ticketId)) === "you") ||
			(item.comment !== null &&
				mentionedNames(item.comment.body, [actor, ...names.map((name) => name.name)]).has(actor.toLowerCase())),
	);
};
