import type { FlowExecutionStartInput } from "@trellis/api";
import { sql } from "drizzle-orm";
import { requireActor, type ServiceCtx } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { fail, invalidInput } from "../../errors.ts";
import { flowProjectIdOf, resolveFlow } from "../flows/queries.ts";
import { assertProjectActive, resolveTicket } from "../refs.ts";

export async function validateStart(ctx: ServiceCtx, tx: Tx, input: FlowExecutionStartInput) {
	const actor = requireActor(ctx);
	if (actor.kind === "system") throw invalidInput("actor", "A person or an agent must request the flow start.");
	const ticket = await resolveTicket(ctx, tx, input.ticket);
	assertProjectActive(ctx, ticket.projectId);
	if (ticket.completedAt !== null) throw invalidInput("ticket", "Reopen the ticket before a flow starts.");
	const resolved = await resolveFlow(tx, input.flow);
	await tx.execute(sql`SELECT id FROM flows WHERE id=${resolved.id} FOR UPDATE`);
	const flow = await resolveFlow(tx, resolved.id);
	const projectId = await flowProjectIdOf(tx, flow.id);
	if (projectId !== null && projectId !== ticket.projectId) throw fail("FLOW_NOT_IN_PROJECT");
	const linked = await rows<{ id: string; headSha: string | null }>(
		tx,
		sql`SELECT p.id,p.head_sha AS "headSha" FROM ticket_pull_requests link
		JOIN pull_requests p ON p.id=link.pull_request_id WHERE link.ticket_id=${ticket.id}`,
	);
	const diffId = input.diffId ?? (linked.length === 1 ? linked[0]!.id : null);
	if (input.allowRepeat && (diffId === null || input.repeatReason === undefined))
		throw invalidInput("allowRepeat", "A repeated diff flow requires its diff ID and a reason from the user.");
	if (input.repeatReason !== undefined && !input.allowRepeat)
		throw invalidInput("repeatReason", "A repeat reason requires allowRepeat.");
	const diff = linked.find((link) => link.id === diffId);
	if (diffId !== null && !diff) throw invalidInput("diffId", "The diff must link to the supplied ticket.");
	return { actor, ticket, flow, diffId, currentHead: diff?.headSha ?? null };
}
