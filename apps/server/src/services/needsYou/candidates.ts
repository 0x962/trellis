import { waitingFor } from "@trellis/api";
import { sql } from "drizzle-orm";
import { iso, rows } from "../../db/queries/support.ts";
import { ticketSummaries } from "../../db/queries/ticketSummaries.ts";
import type { Tx } from "../../db/tx.ts";

export type Candidate = {
	id: string;
	section: "review";
	ticketId: string;
	receivedAt: string;
	snoozedUntil: string | null;
	ignored: boolean;
	title: string;
	priority: string;
	createdAt: string;
	updatedAt: string;
	identifier: string;
};

// The inbox of a person holds one item per ticket that waits for them. The
// SQL below collects every ticket that is not done and not canceled and that
// is either in the review category or links an open pull request.
// `waitingFor` then keeps the ticket only while it still waits for the
// person: it drops a ticket whose agent run works, and it drops a ticket
// whose pull request still needs the agent or still runs a check. The item id
// names the last status change, so a move to a new status starts a new item
// that no earlier snooze or ignore covers. An item leaves the inbox when the
// ticket moves to the done or the canceled category, when an agent starts to
// work on it, or when it starts to wait for somebody else.
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
				'review' AS section, t.id AS ticket_id, COALESCE(a.created_at, t.created_at) AS received_at
			FROM tickets t JOIN statuses s ON s.id=t.status_id
			LEFT JOIN LATERAL (SELECT id, created_at FROM activity WHERE ticket_id=t.id AND field='status' ORDER BY id DESC LIMIT 1) a ON true
			WHERE s.category NOT IN ('done', 'canceled') AND (
				s.category='review' OR EXISTS (
					SELECT 1 FROM ticket_pull_requests link
					JOIN pull_requests pull_request ON pull_request.id=link.pull_request_id
					WHERE link.ticket_id=t.id AND pull_request.state='open'
				)
			)
		)
		SELECT e.id, e.section, e.ticket_id AS "ticketId", ${iso(sql`e.received_at`)} AS "receivedAt",
			${iso(sql`state.snoozed_until`)} AS "snoozedUntil", COALESCE(state.ignored,false) AS ignored,
			t.title,t.priority,${iso(sql`t.created_at`)} AS "createdAt",${iso(sql`t.updated_at`)} AS "updatedAt",
			p.key || '-' || t.number AS identifier
		FROM eligible e JOIN tickets t ON t.id=e.ticket_id JOIN projects p ON p.id=t.project_id
		LEFT JOIN needs_you_states state ON state.item_id=e.id AND state.actor_name=${actor}
	`,
	);
	const reviewTickets = new Map(
		(
			await ticketSummaries(
				tx,
				found.map((item) => item.ticketId),
			)
		).map((ticket) => [ticket.id, ticket]),
	);
	return found.filter(
		(item) => waitingFor(reviewTickets.get(item.ticketId)!, workingTicketIds.has(item.ticketId)) === "you",
	);
};
