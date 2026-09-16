import type { ManagerNextAction } from "@trellis/api/contract";
import { sql } from "drizzle-orm";
import type { RequestContext } from "../../../context.ts";
import { rows } from "../../../db/queries/support.ts";
import type { Tx } from "../../../db/tx.ts";
import { invalidInput } from "../../../errors.ts";
import { conditionMet } from "./condition.ts";
import { columns, enabled, ticketState } from "./queries.ts";

export const assertTicketReady = async (
	ctx: Pick<RequestContext, "now">,
	tx: Tx,
	input: { ticketId: string; projectId: string },
) => {
	const waits = await rows<ManagerNextAction & { status_id: string }>(
		tx,
		sql`SELECT ${columns},status_id FROM manager_next_actions
		WHERE ticket_id=${input.ticketId} AND state='waiting' AND wait_for IS NOT NULL`,
	);
	for (const action of waits) {
		const ticket = await ticketState(tx, action);
		if (!ticket || ticket.statusId !== action.status_id) continue;
		if (
			!(await enabled(tx, { projectId: action.projectId, ticketProjectId: input.projectId })) ||
			!(await conditionMet(tx, { waitFor: action.waitFor!, ticketId: input.ticketId, now: ctx.now }))
		)
			throw invalidInput(
				"ticket",
				"This ticket has an outstanding wait. Read or cancel its next action before an assignment.",
			);
	}
};
