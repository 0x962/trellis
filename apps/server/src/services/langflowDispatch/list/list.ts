import type { FlowExecutionIdentityV1, FlowExecutionListV1Input } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../../context.ts";
import { rows } from "../../../db/queries/support.ts";
import type { Tx } from "../../../db/tx.ts";
import { resolveFlow } from "../../flows/flows.ts";
import { resolveTicket } from "../../refs.ts";

export async function list(ctx: ServiceCtx, tx: Tx, input: FlowExecutionListV1Input) {
	const flow = input.flow === undefined ? null : await resolveFlow(tx, input.flow);
	const ticket = input.ticket === undefined ? null : await resolveTicket(ctx, tx, input.ticket);
	return rows<FlowExecutionIdentityV1>(
		tx,
		sql`SELECT id, engine, flow_id AS "flowId", status, pending AS "pendingSubmission" FROM (
			SELECT id, 'legacy' AS engine, flow_id, ticket_id, diff_id, created_at,
				state->>'status' AS status, state->>'status' IS NULL AS pending FROM flow_executions
			UNION ALL
			SELECT e.execution_id AS id, 'langflow' AS engine, e.flow_id, e.ticket_id, e.diff_id, e.created_at,
				p.view->>'status' AS status,
				CASE WHEN p.view->>'status' IN ('succeeded','failed','canceled') THEN false
					ELSE p.view->>'status' IS NULL
						OR e.submission->>'state' IN ('reserved','submission_unknown')
						OR e.admission->>'state' = 'closed'
						OR e.authority IS NULL
						OR (e.authority->>'expiresAt')::timestamptz <= ${ctx.now}
				END AS pending
			FROM langflow_executions e
			LEFT JOIN langflow_execution_projections p ON p.execution_id=e.execution_id
		) AS executions
		WHERE ${flow === null ? sql`true` : sql`flow_id=${flow.id}`}
		AND ${ticket === null ? sql`true` : sql`ticket_id=${ticket.id}`}
		AND ${input.diffId === undefined ? sql`true` : sql`diff_id=${input.diffId}`}
		ORDER BY created_at DESC, id DESC
		LIMIT ${input.limit ?? 100} OFFSET ${input.offset ?? 0}`,
	);
}
