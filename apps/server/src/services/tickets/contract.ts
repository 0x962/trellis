import { type Ticket, type TicketContract, TicketContractInputSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import { ticketGet, ticketSummary } from "../../db/queries/ticketGet.ts";
import type { Tx } from "../../db/tx.ts";
import { type Change, record } from "../activity.ts";
import { assertProjectActive, resolveTicket } from "../refs.ts";
import { assertVersion } from "./rules.ts";

const fields = ["result", "files", "leaveAlone", "verify", "reviewFocus"] as const;

export const contract = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<Ticket> => {
	const input = TicketContractInputSchema.parse(rawInput);
	const target = await resolveTicket(ctx, tx, input.ticket);
	assertProjectActive(ctx, target.projectId);
	await assertVersion(tx, target, input.expectedVersion);
	const [current] = await rows<TicketContract>(
		tx,
		sql`SELECT result, files, leave_alone AS "leaveAlone", verify, review_focus AS "reviewFocus"
			FROM tickets WHERE id = ${target.id}`,
	);
	const changes: Change[] = fields.flatMap((field) => {
		const from = current![field];
		const to = input[field];
		return JSON.stringify(from) === JSON.stringify(to)
			? []
			: [
					{
						field,
						from: typeof from === "string" ? from : JSON.stringify(from),
						to: typeof to === "string" ? to : JSON.stringify(to),
					},
				];
	});
	if (changes.length === 0) return ticketGet(tx, target.id);

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
		changes,
	});
	ctx.emit({
		type: "ticket.updated",
		summary: await ticketSummary(tx, target.id),
		fields: changes.map(({ field }) => field!),
		batchId,
	});
	return ticketGet(tx, target.id);
};
