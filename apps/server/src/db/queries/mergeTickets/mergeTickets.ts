import { sql } from "drizzle-orm";
import type { Tx } from "../../tx.ts";
import { rows } from "../support.ts";

export function mergeTickets(
	tx: Tx,
	input: { ref: { owner: string; repo: string; number: number }; state: "open" | "merged" },
) {
	return rows<{ id: string; identifier: string; title: string; statusId: string }>(
		tx,
		sql`SELECT t.id, p.key || '-' || t.number AS identifier, t.title, t.status_id AS "statusId"
			FROM pull_requests pr
			JOIN ticket_pull_requests link ON link.pull_request_id = pr.id
			JOIN tickets t ON t.id = link.ticket_id
			JOIN statuses s ON s.id = t.status_id
			JOIN projects p ON p.id = t.project_id
			WHERE pr.owner = ${input.ref.owner} AND pr.repo = ${input.ref.repo}
				AND pr.number = ${input.ref.number} AND pr.state = ${input.state}
				AND p.archived_at IS NULL AND s.category NOT IN ('done', 'canceled')
				AND EXISTS (SELECT 1 FROM statuses done WHERE done.project_id = t.project_id AND done.category = 'done')
				AND NOT EXISTS (
					SELECT 1 FROM ticket_pull_requests other_link
					JOIN pull_requests other_pr ON other_pr.id = other_link.pull_request_id
					WHERE other_link.ticket_id = t.id AND other_pr.id <> pr.id AND other_pr.state = 'open'
				)
			ORDER BY p.key, t.number, t.id`,
	);
}
