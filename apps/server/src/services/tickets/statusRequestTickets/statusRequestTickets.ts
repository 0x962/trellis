import { sql } from "drizzle-orm";
import { rows, textArray } from "../../../db/queries/support.ts";
import type { Tx } from "../../../db/tx.ts";

export const incompleteTicketIds = async (tx: Tx, ids: string[]) =>
	(
		await rows<{ id: string }>(
			tx,
			sql`SELECT ticket.id
			FROM tickets ticket
			JOIN statuses status ON status.id = ticket.status_id
			WHERE ticket.id = ANY(${textArray(ids)}) AND status.category NOT IN ('done', 'canceled')
			ORDER BY ticket.id`,
		)
	).map((ticket) => ticket.id);
