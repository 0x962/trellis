import { type Ticket, type TicketContract, TicketContractInputSchema, ticketContractFields } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import { ticketGet, ticketSummary } from "../../db/queries/ticketGet.ts";
import type { Tx } from "../../db/tx.ts";
import { record } from "../activity.ts";
import { assertProjectActive, resolveTicket } from "../refs.ts";
import { assertVersion } from "./rules.ts";

export const setContract = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<Ticket> => {
	const input = TicketContractInputSchema.parse(rawInput);
	const target = await resolveTicket(ctx, tx, input.ticket);
	assertProjectActive(ctx, target.projectId);
	await assertVersion(tx, target, input.expectedVersion);
	const [current] = await rows<TicketContract>(
		tx,
		sql`SELECT result, files, leave_alone AS "leaveAlone", verify, review_focus AS "reviewFocus"
			FROM tickets WHERE id = ${target.id}`,
	);
	const changed = ticketContractFields.some(
		(field) => JSON.stringify(current![field]) !== JSON.stringify(input[field]),
	);
	if (!changed) return ticketGet(tx, target.id);

	const batchId = ulid();
	await tx.execute(sql`UPDATE tickets SET result = ${input.result}, files = ${JSON.stringify(input.files)}::jsonb,
		leave_alone = ${JSON.stringify(input.leaveAlone)}::jsonb, verify = ${JSON.stringify(input.verify)}::jsonb,
		review_focus = ${JSON.stringify(input.reviewFocus)}::jsonb, version = version + 1, updated_at = ${ctx.now}
		WHERE id = ${target.id}`);
	await record(ctx, tx, {
		rootId: target.rootId,
		projectId: target.projectId,
		ticketId: target.id,
		action: "ticket.updated",
		batchId,
		changes: [{ field: "contract", from: null, to: null }],
	});
	ctx.emit({
		type: "ticket.updated",
		summary: await ticketSummary(tx, target.id),
		fields: ticketContractFields,
		batchId,
	});
	return ticketGet(tx, target.id);
};
