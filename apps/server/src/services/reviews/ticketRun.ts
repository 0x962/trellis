import { type SQL, sql } from "drizzle-orm";
import { textArray } from "../../db/queries/support.ts";

// The one rule for the agent run that holds a ticket. `agent_runs` allows
// one row of kind `agent` per ticket while nobody closed it, and that row
// takes every message Trellis sends about the pull requests of the ticket.
// A run whose process already ended still holds the ticket: the person
// restarts that agent, and the message waits for its terminal. The rule
// names no runtime, because a ticket can hold a run that another program
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

// True while the open assignment of `ticket` runs on this server and has
// one of these terminals. The caller passes the terminals of the processes
// that run and take input. Trellis writes into the terminal of a run that
// it starts itself, which is a run of the runtime `native`.
export const readyAssignment = (ticket: SQL, terminals: readonly string[]) =>
	sql`EXISTS (SELECT 1 FROM agent_runs assignment
		WHERE ${openAssignment(sql`assignment`, ticket)} AND assignment.runtime = 'native'
			AND assignment.terminal_id = ANY(${textArray(terminals)}))`;
