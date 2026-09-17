import { isDeepStrictEqual } from "node:util";
import type { ManagerWait } from "@trellis/api/contract";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { RequestContext } from "../../../context.ts";
import { rows } from "../../../db/queries/support.ts";
import type { Tx } from "../../../db/tx.ts";
import { invalidInput } from "../../../errors.ts";
import { dispatchMessageId } from "../messageId.ts";
import type { Dispatch, WorkOutcome } from "../types.ts";
import { ticketState } from "./queries.ts";
import { validateWait } from "./validateWait.ts";

export const record = async (
	ctx: Pick<RequestContext, "now">,
	tx: Tx,
	input: { dispatch: Dispatch; outcome: WorkOutcome },
) => {
	const { dispatch, outcome } = input;
	if (outcome.ticketId === null) return;
	const delivered = dispatch.nextActions.find((action) => action.ticketId === outcome.ticketId);
	const waitFor = outcome.waitFor ?? null;
	if (delivered) {
		const [current] = await rows<{ state: string; wait_for: ManagerWait | null }>(
			tx,
			sql`SELECT state,wait_for FROM manager_next_actions WHERE id=${delivered.id}`,
		);
		if (current?.state !== "waiting") return;
		if (!isDeepStrictEqual(current.wait_for, waitFor))
			await tx.execute(sql`UPDATE manager_next_actions SET state='canceled',eligible_at=NULL WHERE id=${delivered.id}`);
	}
	if (outcome.status !== "queued" && !(outcome.status === "blocked" && waitFor)) {
		if (delivered)
			await tx.execute(sql`UPDATE manager_next_actions SET state='canceled',eligible_at=NULL
   WHERE id=${delivered.id} AND state='waiting'`);
		return;
	}
	const ticket = await ticketState(tx, { projectId: dispatch.projectId, ticketId: outcome.ticketId });
	if (!ticket || ticket.completedAt !== null)
		throw invalidInput("ticketId", "Queue an open ticket in this manager's scope.");
	if (waitFor) await validateWait(tx, { projectId: dispatch.projectId, ticketId: outcome.ticketId, waitFor });
	await tx.execute(sql`UPDATE manager_next_actions SET state='canceled',eligible_at=NULL
		WHERE project_id=${dispatch.projectId} AND ticket_id=${outcome.ticketId} AND state='waiting' AND status_id<>${ticket.statusId}`);
	const requestId = dispatchMessageId({ id: `${dispatch.id}:${outcome.ticketId}`, generation: 0 });
	await tx.execute(sql`INSERT INTO manager_next_actions (id,project_id,ticket_id,status_id,assignment_request_id,reason,wait_for,created_at)
 VALUES (${ulid()},${dispatch.projectId},${outcome.ticketId},${ticket.statusId},${requestId},${outcome.reason},${waitFor ? JSON.stringify(waitFor) : null}::jsonb,${ctx.now})
 ON CONFLICT (project_id,ticket_id) WHERE state='waiting' DO UPDATE SET reason=EXCLUDED.reason
 WHERE manager_next_actions.id=${delivered?.id ?? null}`);
};
