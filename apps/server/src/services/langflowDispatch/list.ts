import type { FlowExecutionIdentityV1, FlowExecutionListV1Input } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { resolveFlow } from "../flows/queries.ts";
import { resolveTicket } from "../refs.ts";

export async function list(ctx: ServiceCtx, tx: Tx, input: FlowExecutionListV1Input) {
	const flow = input.flow === undefined ? null : await resolveFlow(tx, input.flow);
	const ticket = input.ticket === undefined ? null : await resolveTicket(ctx, tx, input.ticket);
	return rows<FlowExecutionIdentityV1>(
		tx,
		sql`SELECT id, engine FROM (
			SELECT id, 'legacy' AS engine, flow_id, ticket_id, diff_id, created_at FROM flow_executions
			UNION ALL
			SELECT execution_id AS id, 'langflow' AS engine, flow_id, ticket_id, diff_id, created_at FROM langflow_executions
		) AS executions
		WHERE ${flow === null ? sql`true` : sql`flow_id=${flow.id}`}
		AND ${ticket === null ? sql`true` : sql`ticket_id=${ticket.id}`}
		AND ${input.diffId === undefined ? sql`true` : sql`diff_id=${input.diffId}`}
		ORDER BY created_at DESC, id DESC
		LIMIT ${input.limit ?? 100} OFFSET ${input.offset ?? 0}`,
	);
}
