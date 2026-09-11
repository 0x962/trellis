import { sql } from "drizzle-orm";
import { rows } from "../db/queries/support.ts";
import type { Tx } from "../db/tx.ts";

// The tickets that link one pull request, in link order, and the projects
// those tickets sit in. A pull request event carries both, so an event
// stream scoped to one of the tickets or one of the projects receives it.
// `ticketIdentifiers` names the same tickets in the same order, in the
// `KEY-n` form a person and an agent read.
export const linkScope = async (tx: Tx, id: string) => {
	const found = await rows<{ ticket_id: string; identifier: string; project_id: string }>(
		tx,
		sql`
			SELECT l.ticket_id, root.key || '-' || t.number AS identifier, t.project_id
			FROM ticket_pull_requests l
			JOIN tickets t ON t.id = l.ticket_id
			JOIN projects root ON root.id = t.root_id
			WHERE l.pull_request_id = ${id}
			ORDER BY l.created_at, l.ticket_id
		`,
	);
	return {
		ticketIds: found.map((row) => row.ticket_id),
		ticketIdentifiers: found.map((row) => row.identifier),
		projectIds: [...new Set(found.map((row) => row.project_id))],
	};
};
