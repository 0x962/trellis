import type { BoardOutput } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { Tx } from "../tx.ts";
import { rows, textArray } from "./support.ts";
import { filterWhere, type TicketFilter } from "./ticketFilters.ts";
import { type SummaryRow, summaryStatement, toSummary } from "./ticketSummary.ts";

// `statusIds` is the column set in display order: the effective statuses of
// the project the board shows.
export type BoardInput = TicketFilter & { statusIds: readonly string[] };

export const BOARD_COLUMN_LIMIT = 100;

// One statement: every ticket of the filter is ranked inside its column by
// (position, id) and counted per column; only the first 100 of each column
// become summary rows. A column without tickets reads count 0.
export const board = async (tx: Tx, input: BoardInput): Promise<BoardOutput> => {
	const page = sql`ranked AS (
		SELECT t.id, t.status_id,
			row_number() OVER (PARTITION BY t.status_id ORDER BY t.position, t.id) AS rn,
			count(*) OVER (PARTITION BY t.status_id)::int AS total
		FROM tickets t JOIN statuses s ON s.id = t.status_id
		WHERE t.status_id = ANY(${textArray(input.statusIds)}) AND ${filterWhere(input)}
	), page AS (SELECT id, status_id, rn, total FROM ranked WHERE rn <= ${BOARD_COLUMN_LIMIT})`;
	const found = await rows<SummaryRow & { total: number }>(
		tx,
		summaryStatement(page, sql`, page.total`, sql`page.status_id, page.rn`),
	);
	const columns = input.statusIds.map((statusId) => {
		const own = found.filter((row) => row.status_id === statusId);
		return { statusId, count: own[0]?.total ?? 0, items: own.map(toSummary) };
	});
	return { columns };
};
