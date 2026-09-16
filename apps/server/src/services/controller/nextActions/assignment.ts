import type { ManagerNextAction } from "@trellis/api/contract";
import { sql } from "drizzle-orm";
import type { RequestContext } from "../../../context.ts";
import { rows } from "../../../db/queries/support.ts";
import type { Tx } from "../../../db/tx.ts";
import { invalidInput } from "../../../errors.ts";
import { getRun } from "../../agentRuns/queries.ts";
import { conditionMet } from "./condition.ts";
import { assertOwner, columns, enabled, ticketState } from "./queries.ts";

type Input = { requestId?: string; ticketId: string | null; personaId: string; accountId?: string };
export const assignment = async (ctx: Pick<RequestContext, "actor" | "now">, tx: Tx, input: Input) => {
	if (input.requestId === undefined) return undefined;
	const [action] = await rows<ManagerNextAction & { status_id: string }>(
		tx,
		sql`SELECT ${columns},status_id FROM manager_next_actions
 WHERE assignment_request_id=${input.requestId}`,
	);
	if (!action) return undefined;
	await assertOwner(ctx, tx, action.projectId);
	if (action.ticketId !== input.ticketId) throw invalidInput("requestId", "This action belongs to another ticket.");
	if (action.state === "assigned") {
		const run = await getRun(tx, action.runId!);
		if (run.personaId !== input.personaId || (input.accountId !== undefined && run.accountId !== input.accountId))
			throw invalidInput("requestId", "This action already has another persona assignment.");
		return run;
	}
	const ticket = await ticketState(tx, action);
	if (action.state !== "waiting" || !ticket || ticket.completedAt !== null || ticket.statusId !== action.status_id)
		throw invalidInput(
			"requestId",
			"This next action is no longer current. Read the ticket before another assignment.",
		);
	if (!(await enabled(tx, { projectId: action.projectId, ticketProjectId: ticket.projectId })))
		throw invalidInput("requestId", "This next action is paused. Resume work before its assignment.");
	if (action.waitFor && !(await conditionMet(tx, { waitFor: action.waitFor, ticketId: action.ticketId, now: ctx.now })))
		throw invalidInput("requestId", "This next action still waits for its wake condition.");
	return undefined;
};
