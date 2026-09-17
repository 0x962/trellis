import { sql } from "drizzle-orm";
import { iso, rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { dispatchMessageId } from "./messageId.ts";
import type { Dispatch } from "./types.ts";

export const workItems = (dispatch: Pick<Dispatch, "id" | "events" | "outcomes" | "nextActions">) => {
	const tickets: (string | null)[] = [
		...new Set([
			...dispatch.events.map((event) => event.ticketId),
			...dispatch.nextActions.map((action) => action.ticketId),
		]),
	];
	if (!tickets.length) tickets.push(null);
	return tickets
		.filter((ticketId) => !dispatch.outcomes.some((outcome) => outcome.ticketId === ticketId))
		.map((ticketId) => ({
			ticketId,
			assignmentRequestId:
				dispatch.nextActions.find((action) => action.ticketId === ticketId)?.assignmentRequestId ??
				dispatchMessageId({ id: `${dispatch.id}:${ticketId ?? "project"}`, generation: 0 }),
		}));
};

export const coordination = async (tx: Tx, dispatch: Pick<Dispatch, "id" | "projectId">) => {
	const [policy] = await rows<{ personaId: string; updatedAt: string }>(
		tx,
		sql`SELECT persona.id AS "personaId", ${iso(sql`persona.updated_at`)} AS "updatedAt"
		FROM projects project JOIN personas persona ON persona.id=COALESCE((SELECT r.persona_id FROM manager_delegations d JOIN agent_runs r ON r.id=d.run_id WHERE d.project_id=project.id AND d.retired_at IS NULL),project.manager_config->>'personaId') WHERE project.id=${dispatch.projectId}`,
	);
	const unfinished = await rows<Pick<Dispatch, "id" | "generation" | "events" | "outcomes" | "nextActions">>(
		tx,
		sql`SELECT id,generation,events,outcomes,next_actions AS "nextActions"
		FROM manager_dispatches WHERE project_id=${dispatch.projectId} AND id<>${dispatch.id} AND work_state='open'
		AND state IN ('sent','unknown') ORDER BY id LIMIT 100`,
	);
	const [count] = await rows<{ count: number }>(
		tx,
		sql`SELECT count(*)::int AS count FROM manager_dispatches
		WHERE project_id=${dispatch.projectId} AND id<>${dispatch.id} AND work_state='open' AND state IN ('sent','unknown')`,
	);
	return {
		policy: policy ?? null,
		unfinished: unfinished.map((item) => ({ id: item.id, generation: item.generation, workItems: workItems(item) })),
		unfinishedCount: count!.count,
	};
};
