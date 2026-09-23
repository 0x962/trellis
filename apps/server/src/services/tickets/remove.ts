import {
	TicketDeleteInputSchema,
	TicketDeleteManyInputSchema,
	type TicketDeleteManyOutputSchema,
	type TicketDeleteOutputSchema,
} from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { z } from "zod";
import type { ServiceCtx } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import { ticketSummary } from "../../db/queries/ticketGet.ts";
import type { Tx } from "../../db/tx.ts";
import { record } from "../activity.ts";
import { assertProjectActive, resolveTicket, type TicketRow } from "../refs.ts";
import { assertAgentMayDelete } from "./rules.ts";

// Deletes one ticket under `batchId`. The children are detached first, then
// the row goes and the database cascades comments, attachments, pull
// request links, and activity. A pull request with no link left goes with
// it. One project-level activity row keeps the trace: it names the ticket
// in `meta`, because `ticket_id` can no longer point at it.
const deleteOne = async (ctx: ServiceCtx, tx: Tx, batchId: string, row: TicketRow) => {
	const summary = await ticketSummary(tx, row.id);
	const blobs = await rows<{ sha256: string }>(
		tx,
		sql`SELECT DISTINCT sha256 FROM attachments WHERE ticket_id = ${row.id}`,
	);
	await tx.execute(sql`UPDATE tickets SET parent_id = NULL, version = version + 1 WHERE parent_id = ${row.id}`);
	await tx.execute(sql`DELETE FROM tickets WHERE id = ${row.id}`);
	ctx.dropBlobs(blobs.map((blob) => blob.sha256));
	await tx.execute(
		sql`DELETE FROM pull_requests p
			WHERE NOT p.review_retained AND NOT EXISTS (SELECT 1 FROM ticket_pull_requests l WHERE l.pull_request_id = p.id)`,
	);
	await record(ctx, tx, {
		projectId: row.projectId,
		ticketId: null,
		action: "ticket.deleted",
		batchId,
		changes: [{ field: null, from: null, to: null, meta: { identifier: row.identifier, title: row.title } }],
	});
	ctx.emit({ type: "ticket.deleted", summary, fields: [], batchId });
	return row.identifier;
};

const remove = async (
	ctx: ServiceCtx,
	tx: Tx,
	rawInput: unknown,
): Promise<z.infer<typeof TicketDeleteOutputSchema>> => {
	const input = TicketDeleteInputSchema.parse(rawInput);
	assertAgentMayDelete(ctx, input.force);
	const row = await resolveTicket(ctx, tx, input.ticket);
	assertProjectActive(ctx, row.projectId);
	return { deleted: await deleteOne(ctx, tx, ulid(), row) };
};

export { remove as delete };

// One batch and one transaction: a ticket the rules refuse rolls every
// delete back.
export const deleteMany = async (
	ctx: ServiceCtx,
	tx: Tx,
	rawInput: unknown,
): Promise<z.infer<typeof TicketDeleteManyOutputSchema>> => {
	const input = TicketDeleteManyInputSchema.parse(rawInput);
	assertAgentMayDelete(ctx, input.force);
	const batchId = ulid();
	const deleted: string[] = [];
	for (const ref of input.tickets) {
		const row = await resolveTicket(ctx, tx, ref);
		assertProjectActive(ctx, row.projectId);
		deleted.push(await deleteOne(ctx, tx, batchId, row));
	}
	return { deleted };
};
