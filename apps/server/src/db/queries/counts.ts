import type { CountsOutput } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { Tx } from "../tx.ts";
import { rows, textArray } from "./support.ts";
import { filterWhere, type TicketFilter } from "./ticketFilters.ts";

// `statusIds` is the effective status set in position order; every status
// gets a row, at 0 when nothing matches.
export type CountsInput = TicketFilter & { statusIds: readonly string[] };

export const counts = async (tx: Tx, input: CountsInput): Promise<CountsOutput> => {
	const found = await rows<{ status_id: string; n: number }>(
		tx,
		sql`SELECT t.status_id, count(*)::int AS n
			FROM tickets t JOIN statuses s ON s.id = t.status_id
			WHERE t.status_id = ANY(${textArray(input.statusIds)}) AND ${filterWhere(input)}
			GROUP BY t.status_id`,
	);
	const byStatus = input.statusIds.map((statusId) => ({
		statusId,
		count: found.find((row) => row.status_id === statusId)?.n ?? 0,
	}));
	return { total: byStatus.reduce((sum, row) => sum + row.count, 0), byStatus };
};
