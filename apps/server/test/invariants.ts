import { sql } from "drizzle-orm";
import type { Tx } from "../src/db/tx.ts";

// The status invariant: `tickets.status_id` belongs to owner(ticket.project),
// the nearest ancestor-or-self of the ticket's project that owns statuses.
// One statement walks every ticket's project chain and reports the tickets
// whose status lives elsewhere. The walk stops at depth 64.
export const assertStatusInvariant = async (tx: Tx) => {
	const result = await tx.execute(sql`
		WITH RECURSIVE chain AS (
			SELECT t.id AS ticket_id, p.id AS project_id, p.parent_id, 0 AS depth
			FROM tickets t JOIN projects p ON p.id = t.project_id
			UNION ALL
			SELECT chain.ticket_id, p.id, p.parent_id, chain.depth + 1
			FROM chain JOIN projects p ON p.id = chain.parent_id
			WHERE chain.depth < 64
		), owner AS (
			SELECT DISTINCT ON (ticket_id) ticket_id, project_id AS owner_id
			FROM chain
			WHERE EXISTS (SELECT 1 FROM statuses s WHERE s.project_id = chain.project_id)
			ORDER BY ticket_id, depth
		)
		SELECT root.key || '-' || t.number AS identifier, t.status_id
		FROM tickets t
		JOIN projects root ON root.id = t.root_id
		JOIN statuses s ON s.id = t.status_id
		LEFT JOIN owner ON owner.ticket_id = t.id
		WHERE owner.owner_id IS DISTINCT FROM s.project_id
		ORDER BY identifier
	`);
	const violations = result.rows as Array<{ identifier: string; status_id: string }>;
	if (violations.length === 0) return;
	const lines = violations.map((row) => `${row.identifier} points at status ${row.status_id}`);
	throw new Error(`Status invariant violated: ${lines.join("; ")}`);
};
