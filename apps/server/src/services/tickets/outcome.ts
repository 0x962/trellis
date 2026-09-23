import { type Ticket, TicketOutcomeInputSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import { ticketGet, ticketSummary } from "../../db/queries/ticketGet.ts";
import type { Tx } from "../../db/tx.ts";
import { record } from "../activity.ts";
import { assertProjectActive, resolveTicket } from "../refs.ts";
import { assertVersion } from "./rules.ts";

export const setOutcome = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<Ticket> => {
	const input = TicketOutcomeInputSchema.parse(rawInput);
	const target = await resolveTicket(ctx, tx, input.ticket);
	assertProjectActive(ctx, target.projectId);
	await assertVersion(tx, target, input.expectedVersion);
	const [current] = await rows<{ outcome: string }>(tx, sql`SELECT outcome FROM tickets WHERE id = ${target.id}`);
	if (current!.outcome === input.outcome) return ticketGet(tx, target.id);

	const batchId = ulid();
	await tx.execute(sql`UPDATE tickets SET outcome = ${input.outcome}, version = version + 1, updated_at = ${ctx.now}
		WHERE id = ${target.id}`);
	await record(ctx, tx, {
		projectId: target.projectId,
		ticketId: target.id,
		action: "ticket.updated",
		batchId,
		changes: [{ field: "outcome", from: null, to: null }],
	});
	ctx.emit({ type: "ticket.updated", summary: await ticketSummary(tx, target.id), fields: ["outcome"], batchId });
	return ticketGet(tx, target.id);
};
