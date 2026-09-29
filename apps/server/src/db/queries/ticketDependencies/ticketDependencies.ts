import type { TicketDependencies, TicketDependency } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { Tx } from "../../tx.ts";
import { rows } from "../support.ts";

export const ticketDependencies = async (tx: Tx, id: string): Promise<TicketDependencies> => {
	const found = await rows<TicketDependency & { direction: "waitsOn" | "blocks" }>(
		tx,
		sql`
		SELECT p.key || '-' || t.number AS identifier, t.title, s.category AS status, edge.direction
		FROM (
			SELECT depends_on_id AS id, 'waitsOn' AS direction FROM ticket_deps WHERE ticket_id = ${id}
			UNION ALL
			SELECT ticket_id AS id, 'blocks' AS direction FROM ticket_deps WHERE depends_on_id = ${id}
		) edge
		JOIN tickets t ON t.id = edge.id
		JOIN projects p ON p.id = t.project_id
		JOIN statuses s ON s.id = t.status_id
		ORDER BY p.key, t.number, t.id
	`,
	);
	const result: TicketDependencies = { waitsOn: [], blocks: [] };
	for (const { direction, ...ticket } of found) result[direction].push(ticket);
	return result;
};
