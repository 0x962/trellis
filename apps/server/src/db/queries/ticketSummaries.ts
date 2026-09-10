import type { TicketSummary } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { Tx } from "../tx.ts";
import { rows, textArray } from "./support.ts";
import { type SummaryRow, summaryStatement, toSummary } from "./ticketSummary.ts";

// The TicketSummary of every id in `ids`, in ticket number order. A service
// that changed a batch of tickets reads their summaries once for its events.
export const ticketSummaries = async (tx: Tx, ids: string[]): Promise<TicketSummary[]> => {
	if (ids.length === 0) return [];
	const found = await rows<SummaryRow>(
		tx,
		summaryStatement(sql`page AS (SELECT u.id, 0 AS rn FROM unnest(${textArray(ids)}) AS u(id))`, sql``, sql`t.number`),
	);
	return found.map(toSummary);
};
