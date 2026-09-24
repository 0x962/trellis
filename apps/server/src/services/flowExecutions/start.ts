import { isDeepStrictEqual } from "node:util";
import { type FlowExecutionStartInput, validateFlowGraph } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { createFlowExecution } from "../../agents/nativeFlow/createFlowExecution.ts";
import { requireActor, type ServiceCtx } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { fail, invalidInput } from "../../errors.ts";
import { assertVersion, flowProjectIdOf, readDoc, resolveFlow } from "../flows/queries.ts";
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
		const { repeatOf: _repeatOf, ...request } = row.request as Record<string, unknown>;
		if (!isDeepStrictEqual(request, input))
			throw invalidInput("requestId", "This request identifier already names a different flow start.");
		return get(ctx, tx, { id: row.id });
	};
	const [previous] = await lookup();
	if (previous) return replay(previous);
	const ticket = await resolveTicket(ctx, tx, input.ticket);
	assertProjectActive(ctx, ticket.projectId);
	if (ticket.completedAt !== null) throw invalidInput("ticket", "Reopen the ticket before a flow starts.");
	const resolved = await resolveFlow(tx, input.flow);
	await tx.execute(sql`SELECT id FROM flows WHERE id=${resolved.id} FOR UPDATE`);
	const flow = await resolveFlow(tx, resolved.id);
	// A flow can serve its own project or every project.
	const flowProjectId = await flowProjectIdOf(tx, flow.id);
	if (flowProjectId !== null && flowProjectId !== ticket.projectId) throw fail("FLOW_NOT_IN_PROJECT");
	const linked = await rows<{ id: string }>(
		tx,
		sql`SELECT pull_request_id AS id FROM ticket_pull_requests WHERE ticket_id=${ticket.id}`,
	);
	const diffId = input.diffId ?? (linked.length === 1 ? linked[0]!.id : undefined);
	let repeatOf: string | undefined;
	if (input.allowRepeat && (diffId === undefined || input.repeatReason === undefined))
		throw invalidInput("allowRepeat", "A repeated diff flow requires its diff ID and a reason from the user.");
	if (input.repeatReason !== undefined && !input.allowRepeat)
		throw invalidInput("repeatReason", "A repeat reason requires allowRepeat.");
	if (diffId !== undefined) {
		if (!linked.some((link) => link.id === diffId))
			throw invalidInput("diffId", "The diff must link to the supplied ticket.");
		const [existing] = await rows<{ id: string }>(
			tx,
			sql`SELECT id FROM flow_executions WHERE flow_id=${flow.id} AND diff_id=${diffId} ORDER BY created_at DESC,id DESC LIMIT 1`,
		);
		if (existing && !input.allowRepeat) {
			const last = await get(ctx, tx, existing);
			if (last.state.failureKind !== "error") return last;
		}
		repeatOf = existing?.id;
	}
	assertVersion(flow, input.expectedVersion);
	const doc = await readDoc(tx, flow);
	const issues = validateFlowGraph(doc, "run");
	if (issues.length > 0) throw invalidInput("flow", issues.map((issue) => issue.message).join("\n"));
	const state = createFlowExecution(doc, ctx.now.getTime());
	const [created] = await rows<{ id: string }>(
		tx,
		sql`INSERT INTO flow_executions (id,flow_id,ticket_id,project_id,diff_id,actor_kind,actor_name,request_id,request,head_sha,doc,state,revision,created_at,updated_at)
	VALUES (${ulid()},${flow.id},${ticket.id},${ticket.projectId},${diffId ?? null},${actor.kind},${actor.name},${input.requestId},${JSON.stringify({ ...input, ...(repeatOf === undefined ? {} : { repeatOf }) })}::jsonb,${input.headSha ?? null},${JSON.stringify(doc)}::jsonb,${JSON.stringify(state)}::jsonb,1,${ctx.now},${ctx.now}) ON CONFLICT (actor_kind,actor_name,request_id) DO NOTHING RETURNING id`,
	);
	if (!created) return replay((await lookup())[0]!);
	ctx.emit({ type: "flows.changed", id: flow.id });
	return get(ctx, tx, { id: created.id });
}
