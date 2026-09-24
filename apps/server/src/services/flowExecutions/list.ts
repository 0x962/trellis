import type { FlowExecutionListInput } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { resolveFlow } from "../flows/queries.ts";
import { resolveTicket } from "../refs.ts";
import { get } from "./queries.ts";
export async function list(ctx: ServiceCtx, tx: Tx, input: FlowExecutionListInput) {
	const flow = input.flow === undefined ? null : await resolveFlow(tx, input.flow);
	const ticket = input.ticket === undefined ? null : await resolveTicket(ctx, tx, input.ticket);
	const records = await rows<{ id: string }>(
		tx,
		sql`SELECT id FROM flow_executions WHERE ${flow === null ? sql`true` : sql`flow_id=${flow.id}`} AND ${ticket === null ? sql`true` : sql`ticket_id=${ticket.id}`} AND ${input.diffId === undefined ? sql`true` : sql`diff_id=${input.diffId}`} ORDER BY created_at DESC,id DESC LIMIT ${input.limit ?? 100} OFFSET ${input.offset ?? 0}`,
	);
	const results = [];
	for (const record of records) results.push(await get(ctx, tx, record));
	return results;
}
