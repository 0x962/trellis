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

// One statement. Each column aggregates its tickets in one index scan: the
// count, and the first 100 ids by (updated_at desc, id desc), so the ticket
// that changed last sits at the top of the column. A column without tickets
// reads count 0. `page` is MATERIALIZED so the planner looks each id up by
// primary key. An inlined `page` makes the planner scan every ticket.
export const board = async (tx: Tx, input: BoardInput): Promise<BoardOutput> => {
	const page = sql`page AS MATERIALIZED (
		SELECT u.id, col.status_id, u.rn::int AS rn, agg.total
		FROM unnest(${textArray(input.statusIds)}) AS col(status_id)
		CROSS JOIN LATERAL (
			SELECT count(*)::int AS total,
				(array_agg(t.id ORDER BY t.updated_at DESC, t.id DESC))[1:${sql.raw(String(BOARD_COLUMN_LIMIT))}] AS ids
			FROM tickets t WHERE t.status_id = col.status_id AND ${filterWhere(input)}
		) agg
		CROSS JOIN LATERAL unnest(agg.ids) WITH ORDINALITY AS u(id, rn)
	)`;
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
