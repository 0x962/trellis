import { type SQL, sql } from "drizzle-orm";

// The one rule for the agent run that holds a ticket. `agent_runs` allows
// one row of kind `agent` per ticket while nobody closed it, and that row
// takes every message Trellis sends about the pull requests of the ticket.
// An idle run keeps its ticket and its saved conversation, so a due comment or check result restarts it.
// The rule names no runtime, because a ticket can hold a run that another program
// started, and `dispatchDeliveries` answers that case with a sentence.
export const openAssignment = (run: SQL, ticket: SQL) =>
	sql`${run}.ticket_id = ${ticket} AND ${run}.kind = 'agent' AND ${run}.closed_at IS NULL`;

// Joins the newest open assignment of `ticket` as `run`, with the columns
// the caller names. The join gives no row when no run holds the ticket.
export const newestOpenRun = (ticket: SQL, columns: SQL) =>
	sql`LEFT JOIN LATERAL (
		SELECT ${columns} FROM agent_runs assignment
		WHERE ${openAssignment(sql`assignment`, ticket)}
		ORDER BY assignment.created_at DESC, assignment.id DESC
		LIMIT 1
	) run ON true`;
