import { sql } from "drizzle-orm";
import { rows, textArray } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";

// Kanban order inside one status column. A new or moved ticket takes the
// midpoint of its neighbours; the column renumbers in steps of 1024 when a
// gap closes under 1. Sort and keyset are `(position, id)`.

export const STEP = 1024;

export type Anchor = { id: string; position: number };

export type Anchors = { after: Anchor | null; before: Anchor | null };

// The position after the last ticket of the column, `movedId` excluded.
export const lastPosition = async (tx: Tx, statusId: string, movedId: string | null) => {
	const found = await rows<{ next: number }>(
		tx,
		sql`SELECT coalesce(max(position), 0) + ${STEP} AS next FROM tickets
			WHERE status_id = ${statusId} AND id IS DISTINCT FROM ${movedId}`,
	);
	return (found[0] as { next: number }).next;
};

const neighbourAfter = async (tx: Tx, statusId: string, movedId: string, anchor: Anchor) => {
	const found = await rows<{ position: number | null }>(
		tx,
		sql`SELECT min(position) AS position FROM tickets
			WHERE status_id = ${statusId} AND id <> ${movedId}
			AND (position, id) > (${anchor.position}::double precision, ${anchor.id}::text)`,
	);
	return (found[0] as { position: number | null }).position;
};

const neighbourBefore = async (tx: Tx, statusId: string, movedId: string, anchor: Anchor) => {
	const found = await rows<{ position: number | null }>(
		tx,
		sql`SELECT max(position) AS position FROM tickets
			WHERE status_id = ${statusId} AND id <> ${movedId}
			AND (position, id) < (${anchor.position}::double precision, ${anchor.id}::text)`,
	);
	return (found[0] as { position: number | null }).position;
};

// The position for `movedId` between the anchors, or null when the two
// neighbours sit under 1 apart and the column needs a renumber first.
export const placeBetween = async (tx: Tx, statusId: string, movedId: string, anchors: Anchors) => {
	if (anchors.after === null && anchors.before === null) return lastPosition(tx, statusId, movedId);
	const prev = anchors.after?.position ?? (await neighbourBefore(tx, statusId, movedId, anchors.before as Anchor));
	const next = anchors.before?.position ?? (await neighbourAfter(tx, statusId, movedId, anchors.after as Anchor));
	if (prev === null) return (next as number) - STEP;
	if (next === null) return prev + STEP;
	if (next - prev < 1) return null;
	return (prev + next) / 2;
};

// Renumbers the column in steps of 1024 with `movedId` at its new place
// and returns the position of `movedId`. Every other row of the column
// changes, so each one bumps its version; `movedId` is written by the
// caller's own UPDATE.
export const renumberColumn = async (tx: Tx, statusId: string, movedId: string, anchors: Anchors) => {
	const column = await rows<{ id: string }>(
		tx,
		sql`SELECT id FROM tickets WHERE status_id = ${statusId} AND id <> ${movedId} ORDER BY position, id`,
	);
	const order = column.map((row) => row.id);
	const at =
		anchors.after !== null
			? order.indexOf(anchors.after.id) + 1
			: anchors.before !== null
				? order.indexOf(anchors.before.id)
				: order.length;
	order.splice(at, 0, movedId);
	const others: string[] = [];
	const positions: number[] = [];
	order.forEach((id, index) => {
		if (id === movedId) return;
		others.push(id);
		positions.push((index + 1) * STEP);
	});
	await tx.execute(
		sql`UPDATE tickets t SET position = v.pos, version = t.version + 1
			FROM unnest(${textArray(others)}, ${sql.param(positions)}::double precision[]) AS v(id, pos)
			WHERE t.id = v.id`,
	);
	return (order.indexOf(movedId) + 1) * STEP;
};
