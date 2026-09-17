import type { ManagerNextAction } from "@trellis/api/contract";
import { sql } from "drizzle-orm";
import type { RequestContext } from "../../../context.ts";
import { iso, rows } from "../../../db/queries/support.ts";
import type { Tx } from "../../../db/tx.ts";
import { invalidInput } from "../../../errors.ts";
import { isManaged, managerScope } from "../../submanagers/scope.ts";
import { conditionMet } from "./condition.ts";

export const columns = sql`id,project_id AS "projectId",ticket_id AS "ticketId",assignment_request_id AS "assignmentRequestId",COALESCE(wait_for->>'type','ready') AS "wakeCondition",wait_for AS "waitFor",
 reason,state,run_id AS "runId",${iso(sql`created_at`)} AS "createdAt",${iso(sql`eligible_at`)} AS "eligibleAt",${iso(sql`assigned_at`)} AS "assignedAt"`;
export const pending = (tx: Tx, input: { projectId?: string }) =>
	rows<ManagerNextAction & { statusId: string }>(
		tx,
		sql`SELECT ${columns},status_id AS "statusId" FROM manager_next_actions WHERE state='waiting'
 AND ${input.projectId ? sql`project_id=${input.projectId}` : sql`true`} ORDER BY notified_at NULLS FIRST,created_at,id`,
	);

export const assertOwner = async (ctx: Pick<RequestContext, "actor">, tx: Tx, projectId: string) => {
	if (ctx.actor?.kind === "human") return;
	const [owner] = await rows(
		tx,
		sql`SELECT id FROM agent_runs WHERE id=${ctx.actor?.name ?? ""}
 AND kind='manager' AND project_id=${projectId} AND closed_at IS NULL`,
	);
	if (ctx.actor?.kind !== "agent" || !owner)
		throw invalidInput("actor", "Use the project's current manager or a human actor.");
};

export const ticketState = async (tx: Tx, input: { projectId: string; ticketId: string }) => {
	const [ticket] = await rows<{ projectId: string; statusId: string; completedAt: string | null }>(
		tx,
		sql` SELECT project_id AS "projectId",status_id AS "statusId",completed_at AS "completedAt" FROM tickets
 WHERE id=${input.ticketId} AND project_id IN (${managerScope(input.projectId, true)})`,
	);
	return ticket;
};

export const enabled = async (tx: Tx, input: { projectId: string; ticketProjectId: string }) => {
	const [state] = await rows<{ allowed: boolean }>(
		tx,
		sql`WITH RECURSIVE ancestors AS (
 SELECT id,parent_id,archived_at,manager_config FROM projects WHERE id=${input.ticketProjectId}
 UNION ALL SELECT p.id,p.parent_id,p.archived_at,p.manager_config FROM projects p JOIN ancestors a ON p.id=a.parent_id
 ) SELECT NOT EXISTS (SELECT 1 FROM ancestors WHERE archived_at IS NOT NULL OR manager_config->>'dispatchPaused'='true')
 AND EXISTS (SELECT 1 FROM projects p WHERE p.id=${input.projectId} AND ${isManaged(sql`p`)})
 AND NOT EXISTS (SELECT 1 FROM settings WHERE key='nativeWorkPaused' AND value='true'::jsonb) AS allowed`,
	);
	return state!.allowed;
};

export const refresh = async (tx: Tx, input: { now: Date; projectId?: string }) => {
	const permissions = new Map<string, boolean>();
	for (const action of await pending(tx, input)) {
		const ticket = await ticketState(tx, action);
		if (!ticket || ticket.completedAt !== null || ticket.statusId !== action.statusId) {
			await tx.execute(sql`UPDATE manager_next_actions SET state='canceled',eligible_at=NULL WHERE id=${action.id}`);
			continue;
		}
		const scope = `${action.projectId}:${ticket.projectId}`;
		if (!permissions.has(scope))
			permissions.set(scope, await enabled(tx, { projectId: action.projectId, ticketProjectId: ticket.projectId }));
		const ready =
			permissions.get(scope) &&
			(!action.waitFor ||
				(await conditionMet(tx, { waitFor: action.waitFor, ticketId: action.ticketId, now: input.now })));
		const eligibleAt = ready ? sql`COALESCE(eligible_at,${input.now})` : sql`NULL`;
		await tx.execute(
			sql`UPDATE manager_next_actions SET eligible_at=${eligibleAt} WHERE id=${action.id} AND eligible_at IS DISTINCT FROM ${eligibleAt}`,
		);
	}
};
