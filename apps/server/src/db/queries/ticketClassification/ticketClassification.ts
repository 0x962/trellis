import { sql } from "drizzle-orm";
import type { Tx } from "../../tx.ts";
import { rows } from "../support.ts";

type Choice = {
	epic: string;
	epicName: string;
	description: string;
	wave: string | null;
	waveName: string | null;
	position: number | null;
	tickets: number;
	unfinishedTickets: number;
};

export const ticketClassification = (
	tx: Tx,
	input: { projectId: string; epicId: string | null; waveId: string | null },
) =>
	rows<Choice>(
		tx,
		sql`SELECT p.key || '/' || e.slug AS epic, e.name AS "epicName", e.description,
			p.key || '/' || e.slug || '/' || w.slug AS wave, w.name AS "waveName", w.position,
			count(t.id)::int AS tickets,
			count(t.id) FILTER (WHERE s.category NOT IN ('done', 'canceled'))::int AS "unfinishedTickets"
			FROM epics e JOIN projects p ON p.id = e.project_id
			LEFT JOIN waves w ON w.epic_id = e.id
			LEFT JOIN tickets t ON t.wave_id = w.id
			LEFT JOIN statuses s ON s.id = t.status_id
			WHERE e.project_id = ${input.projectId}
				AND (e.canceled_at IS NULL OR e.id = ${input.epicId})
				AND (e.id = ${input.epicId}
					OR NOT EXISTS (SELECT 1 FROM tickets member WHERE member.epic_id = e.id)
					OR EXISTS (
						SELECT 1 FROM tickets member JOIN statuses status ON status.id = member.status_id
						WHERE member.epic_id = e.id AND status.category NOT IN ('done', 'canceled')
					))
				AND (${input.epicId}::text IS NULL OR e.id = ${input.epicId})
				AND (${input.waveId}::text IS NULL OR w.id = ${input.waveId})
			GROUP BY p.key, e.id, w.id
			ORDER BY e.name, e.id, w.position, w.id`,
	);
