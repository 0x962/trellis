import { type Ticket, TicketMoveInputSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { Ctx } from "../../context.ts";
import { statusById } from "../../db/queries/statusById.ts";
import { ticketGet, ticketSummary } from "../../db/queries/ticketGet.ts";
import type { Tx } from "../../db/tx.ts";
import { beginBatch } from "../activity.ts";
import { contractError } from "../errors.ts";
import { resolveStatus, resolveTicket, type TicketRow } from "../refs.ts";
import { type Anchor, type Anchors, placeBetween, renumberColumn } from "./position.ts";
import { assertAgentMayComplete, assertProjectOpen, assertVersion, stampColumns } from "./rules.ts";

// An anchor sits in the target column and is not the moved ticket itself.
const resolveAnchor = async (ctx: Ctx, tx: Tx, row: TicketRow, statusId: string, ref: string | undefined) => {
	if (ref === undefined) return null;
	const anchor = await resolveTicket(ctx, tx, ref);
	if (anchor.status_id !== statusId || anchor.id === row.id) throw contractError("INVALID_ANCHOR", undefined);
	return { id: anchor.id, position: anchor.position } satisfies Anchor;
};

// Moves a ticket to a status and a place in that column. A move that keeps
// the status is a reorder: it bumps the version and leaves `updated_at`, so
// a drag inside a column never marks the ticket as touched.
export const move = async (ctx: Ctx, tx: Tx, rawInput: unknown): Promise<Ticket> => {
	const input = TicketMoveInputSchema.parse(rawInput);
	const row = await resolveTicket(ctx, tx, input.ticket);
	assertProjectOpen(row.project_archived);
	await assertVersion(tx, row, input.expectedVersion);
	const next = await resolveStatus(ctx, tx, { projectId: row.project_id, status: input.status });
	const statusChanged = next.id !== row.status_id;
	if (statusChanged) assertAgentMayComplete(ctx, next, input.force);
	const anchors: Anchors = {
		after: await resolveAnchor(ctx, tx, row, next.id, input.after),
		before: await resolveAnchor(ctx, tx, row, next.id, input.before),
	};

	const batch = await beginBatch(ctx, tx);
	const placed = await placeBetween(tx, next.id, row.id, anchors);
	const position = placed ?? (await renumberColumn(tx, next.id, row.id, anchors));
	const fields = [...(statusChanged ? ["status"] : []), ...(position !== row.position ? ["position"] : [])];
	if (fields.length === 0) return ticketGet(tx, row.id);

	const statusSet = statusChanged
		? sql`status_id = ${next.id}, ${stampColumns(next.category, batch.now)}, updated_at = ${batch.now},`
		: sql``;
	await tx.execute(
		sql`UPDATE tickets SET ${statusSet} position = ${position}, version = version + 1 WHERE id = ${row.id}`,
	);
	const base = { rootId: row.root_id, projectId: row.project_id, ticketId: row.id, action: "ticket.updated" };
	if (statusChanged) {
		const current = await statusById(tx, row.status_id);
		await batch.record({
			...base,
			field: "status",
			fromValue: current.name,
			toValue: next.name,
			meta: { fromId: current.id, toId: next.id, fromCategory: current.category, toCategory: next.category },
		});
	}
	if (position !== row.position) {
		await batch.record({ ...base, field: "position", fromValue: String(row.position), toValue: String(position) });
	}
	ctx.emit({ type: "ticket.updated", summary: await ticketSummary(tx, row.id), fields, batchId: batch.id });
	return ticketGet(tx, row.id);
};
