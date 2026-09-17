import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { invalidInput } from "../../errors.ts";
import type { StoredRun } from "./queries.ts";

export const assertResumeTicket = async (tx: Tx, run: StoredRun) => {
	if (run.ticketId === null) return;
	const ticket = await rows(tx, sql`SELECT id FROM tickets WHERE id=${run.ticketId}`);
	if (ticket.length === 0) throw invalidInput("ticket", "This assignment has no ticket.");
};
