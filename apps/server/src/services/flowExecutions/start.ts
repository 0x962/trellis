import { isDeepStrictEqual } from "node:util";
import { type FlowExecutionStartInput, validateFlowGraph } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { createFlowExecution } from "../../agents/nativeFlow/createFlowExecution.ts";
import { requireActor, type ServiceCtx } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { invalidInput } from "../../errors.ts";
import { assertVersion, readDoc, resolveFlow } from "../flows/queries.ts";
import { assertProjectActive, resolveTicket } from "../refs.ts";
import { get } from "./queries.ts";
export async function start(ctx: ServiceCtx, tx: Tx, input: FlowExecutionStartInput) {
	const actor = requireActor(ctx);
	const lookup = () =>
		rows<{ id: string; request: unknown }>(
			tx,
			sql`SELECT id,request FROM flow_executions WHERE actor_kind=${actor.kind} AND actor_name=${actor.name} AND request_id=${input.requestId}`,
		);
	const replay = async (row: { id: string; request: unknown }) => {
		if (!isDeepStrictEqual(row.request, input))
			throw invalidInput("requestId", "This request identifier already names a different flow start.");
		return get(ctx, tx, { id: row.id });
	};
	const [previous] = await lookup();
	if (previous) return replay(previous);
	const ticket = await resolveTicket(ctx, tx, input.ticket);
	assertProjectActive(ctx, ticket.projectId);
	if (ticket.completedAt !== null) throw invalidInput("ticket", "Reopen the ticket before a flow starts.");
	const resolved = await resolveFlow(tx, input.flow);
	await tx.execute(sql`SELECT id FROM flows WHERE id=${resolved.id} FOR SHARE`);
	const flow = await resolveFlow(tx, resolved.id);
	assertVersion(flow, input.expectedVersion);
	const doc = await readDoc(tx, flow);
	const issues = validateFlowGraph(doc, "run");
	if (issues.length > 0) throw invalidInput("flow", issues.map((issue) => issue.message).join("\n"));
	const state = createFlowExecution(doc, ctx.now.getTime());
	const [created] = await rows<{ id: string }>(
		tx,
		sql`INSERT INTO flow_executions (id,flow_id,ticket_id,project_id,actor_kind,actor_name,request_id,request,doc,state,revision,created_at,updated_at)
	VALUES (${ulid()},${flow.id},${ticket.id},${ticket.projectId},${actor.kind},${actor.name},${input.requestId},${JSON.stringify(input)}::jsonb,${JSON.stringify(doc)}::jsonb,${JSON.stringify(state)}::jsonb,1,${ctx.now},${ctx.now}) ON CONFLICT (actor_kind,actor_name,request_id) DO NOTHING RETURNING id`,
	);
	if (!created) return replay((await lookup())[0]!);
	ctx.emit({ type: "flows.changed", id: flow.id });
	return get(ctx, tx, { id: created.id });
}
