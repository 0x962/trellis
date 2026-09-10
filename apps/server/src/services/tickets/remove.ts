import {
	TicketDeleteInputSchema,
	TicketDeleteManyInputSchema,
	type TicketDeleteManyOutputSchema,
	type TicketDeleteOutputSchema,
} from "@trellis/api";
import { sql } from "drizzle-orm";
import type { z } from "zod";
import type { Ctx } from "../../context.ts";
import { ticketSummary } from "../../db/queries/ticketGet.ts";
import type { Tx } from "../../db/tx.ts";
import { type Batch, beginBatch } from "../activity.ts";
import { resolveTicket, type TicketRow } from "../refs.ts";
import { assertAgentMayDelete, assertProjectOpen } from "./rules.ts";

// Deletes one ticket under `batch`. The children are detached first, then
// the row goes and the database cascades comments, attachments, pull
// request links, and activity. A pull request with no link left goes with
// it. One project-level activity row keeps the trace: it names the ticket
// in `meta`, because `ticket_id` can no longer point at it.
const deleteOne = async (ctx: Ctx, tx: Tx, batch: Batch, row: TicketRow) => {
	const summary = await ticketSummary(tx, row.id);
	await tx.execute(sql`UPDATE tickets SET parent_id = NULL, version = version + 1 WHERE parent_id = ${row.id}`);
	await tx.execute(sql`DELETE FROM tickets WHERE id = ${row.id}`);
	await tx.execute(
		sql`DELETE FROM pull_requests p
			WHERE NOT EXISTS (SELECT 1 FROM ticket_pull_requests l WHERE l.pull_request_id = p.id)`,
	);
	await batch.record({
		rootId: row.root_id,
		projectId: row.project_id,
		ticketId: null,
		action: "ticket.deleted",
		meta: { identifier: row.identifier, title: row.title },
	});
	ctx.emit({ type: "ticket.deleted", summary, fields: [], batchId: batch.id });
	return row.identifier;
};

const remove = async (ctx: Ctx, tx: Tx, rawInput: unknown): Promise<z.infer<typeof TicketDeleteOutputSchema>> => {
	const input = TicketDeleteInputSchema.parse(rawInput);
	assertAgentMayDelete(ctx, input.force);
	const row = await resolveTicket(ctx, tx, input.ticket);
	assertProjectOpen(row.project_archived);
	const batch = await beginBatch(ctx, tx);
	return { deleted: await deleteOne(ctx, tx, batch, row) };
};

export { remove as delete };

// One batch and one transaction: a ticket the rules refuse rolls every
// delete back.
export const deleteMany = async (
	ctx: Ctx,
	tx: Tx,
	rawInput: unknown,
): Promise<z.infer<typeof TicketDeleteManyOutputSchema>> => {
	const input = TicketDeleteManyInputSchema.parse(rawInput);
	assertAgentMayDelete(ctx, input.force);
	const batch = await beginBatch(ctx, tx);
	const deleted: string[] = [];
	for (const ref of input.tickets) {
		const row = await resolveTicket(ctx, tx, ref);
		assertProjectOpen(row.project_archived);
		deleted.push(await deleteOne(ctx, tx, batch, row));
	}
	return { deleted };
};
