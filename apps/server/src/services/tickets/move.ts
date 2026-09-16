import { type Ticket, TicketMoveInputSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import { statusById } from "../../db/queries/statusById.ts";
import { ticketGet, ticketSummary } from "../../db/queries/ticketGet.ts";
import type { Tx } from "../../db/tx.ts";
import { fail } from "../../errors.ts";
import { type Change, record } from "../activity.ts";
import { assertStatusRoom } from "../manager/admitTicket.ts";
import { queueBuilderStart } from "../manager/builderStarts/queue.ts";
import { assertProjectActive, resolveStatus, resolveTicket, type TicketRow } from "../refs.ts";
import { type Anchor, type Anchors, placeBetween, renumberColumn } from "./position.ts";
import { assertVersion, stampColumns } from "./rules.ts";

// An anchor sits in the target column and is not the moved ticket itself.
const resolveAnchor = async (ctx: ServiceCtx, tx: Tx, row: TicketRow, statusId: string, ref: string | undefined) => {
	if (ref === undefined) return null;
	const anchor = await resolveTicket(ctx, tx, ref);
	if (anchor.statusId !== statusId || anchor.id === row.id) throw fail("INVALID_ANCHOR");
	return { id: anchor.id, position: anchor.position } satisfies Anchor;
};

// Moves a ticket to a status and a place in that column. A move that keeps
// the status is a reorder: it bumps the version and leaves `updated_at`, so
// a drag inside a column never marks the ticket as touched.
export const move = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<Ticket> => {
	const input = TicketMoveInputSchema.parse(rawInput);
	const row = await resolveTicket(ctx, tx, input.ticket);
	assertProjectActive(ctx, row.projectId);
	await assertVersion(tx, row, input.expectedVersion);
	const next = await resolveStatus(ctx, tx, { projectId: row.projectId, status: input.status });
	const statusChanged = next.id !== row.statusId;
	if (statusChanged) await assertStatusRoom(ctx, tx, next.id, row.projectId);
	const anchors: Anchors = {
		after: await resolveAnchor(ctx, tx, row, next.id, input.after),
		before: await resolveAnchor(ctx, tx, row, next.id, input.before),
	};

	const batchId = ulid();
	const placed = await placeBetween(tx, next.id, row.id, anchors);
	const position = placed ?? (await renumberColumn(tx, next.id, row.id, anchors));
	const fields = [...(statusChanged ? ["status"] : []), ...(position !== row.position ? ["position"] : [])];
	if (fields.length === 0) return ticketGet(tx, row.id);

	const statusSet = statusChanged
		? sql`status_id = ${next.id}, ${stampColumns(next.category, ctx.now)}, updated_at = ${ctx.now},`
		: sql``;
	await tx.execute(
		sql`UPDATE tickets SET ${statusSet} position = ${position}, version = version + 1 WHERE id = ${row.id}`,
	);
	const changes: Change[] = [];
	if (statusChanged) {
		const current = await statusById(tx, row.statusId);
		changes.push({
			field: "status",
			from: current.name,
			to: next.name,
			meta: { fromId: current.id, toId: next.id, fromCategory: current.category, toCategory: next.category },
		});
	}
	if (position !== row.position) {
		changes.push({ field: "position", from: String(row.position), to: String(position) });
	}
	await record(ctx, tx, {
		rootId: row.rootId,
		projectId: row.projectId,
		ticketId: row.id,
		action: "ticket.updated",
		batchId,
		changes,
	});
	if (statusChanged)
		await queueBuilderStart(ctx, tx, { ticketId: row.id, projectId: row.projectId, category: next.category });
	ctx.emit({ type: "ticket.updated", summary: await ticketSummary(tx, row.id), fields, batchId });
	return ticketGet(tx, row.id);
};
