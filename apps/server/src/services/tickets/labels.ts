import type { LabelColor } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../context.ts";
import { rows, textArray } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { resolveLabels } from "../labelRefs.ts";
import { type LabelRow, labelText } from "../labelRows.ts";
import type { TicketRow } from "../refs.ts";

// The labels of one ticket. A ticket write names labels to add and labels to
// remove, never the whole set, so two writers never drop the label of each
// other. A label of a group replaces the label of that group the ticket holds
// already, because a ticket holds one label of a group at most.

type HeldLabel = {
	id: string;
	name: string;
	color: LabelColor;
	group_id: string | null;
	group_name: string | null;
};

// One added, removed, or swapped label, in the shape `applyChanges` records
// and emits. A label change writes no ticket column, so it carries no SET
// clause. `from` and `to` are the name a person reads, and `meta` carries the
// ids, the color, and the group name for a client that draws the row.
export type LabelChange = {
	field: "labels";
	from: string | null;
	to: string | null;
	meta: Record<string, unknown>;
};

export type LabelDeltaInput = { addLabels?: readonly string[]; removeLabels?: readonly string[] };

// The labels one write adds and the labels it removes, already read from the
// database. `null` says the write names no label, so the ticket keeps the
// labels it holds. A ref resolves inside one root, so one plan serves every
// ticket of that root.
export type LabelPlan = { adds: LabelRow[]; removes: LabelRow[] } | null;

const heldLabels = (tx: Tx, ticketId: string) =>
	rows<HeldLabel>(
		tx,
		sql`SELECT l.id, l.name, l.color, l.group_id, g.name AS group_name
			FROM ticket_labels tl
			JOIN labels l ON l.id = tl.label_id
			LEFT JOIN label_groups g ON g.id = l.group_id
			WHERE tl.ticket_id = ${ticketId}`,
	);

const held = (label: LabelRow): HeldLabel => ({
	id: label.id,
	name: label.name,
	color: label.color,
	group_id: label.group_id,
	group_name: label.group_name,
});

const insertRows = (tx: Tx, ticketId: string, labelIds: readonly string[], now: Date) =>
	tx.execute(
		sql`INSERT INTO ticket_labels (ticket_id, label_id, created_at) VALUES ${sql.join(
			labelIds.map((labelId) => sql`(${ticketId}, ${labelId}, ${now})`),
			sql`, `,
		)}`,
	);

// Reads the labels `input` names once for the tickets of `rootId`. A batch of
// 200 tickets therefore reads each label ref one time.
export const planLabelDeltas = async (
	ctx: ServiceCtx,
	tx: Tx,
	rootId: string,
	input: LabelDeltaInput,
): Promise<LabelPlan> => {
	if (input.addLabels === undefined && input.removeLabels === undefined) return null;
	const adds =
		input.addLabels === undefined
			? []
			: await resolveLabels(ctx, tx, { rootId, refs: input.addLabels, field: "addLabels" });
	// A label named in both lists stays as it was: the add wins and the remove
	// is dropped, so the write changes nothing for it.
	const removes = (
		input.removeLabels === undefined
			? []
			: await resolveLabels(ctx, tx, { rootId, refs: input.removeLabels, field: "removeLabels" })
	).filter((label) => !adds.some((added) => added.id === label.id));
	return { adds, removes };
};

// Writes the labels of `plan` on one ticket, and returns one change per label
// that moved. An added label the ticket holds already, and a removed label it
// does not hold, change nothing.
export const applyLabelPlan = async (
	ctx: ServiceCtx,
	tx: Tx,
	row: TicketRow,
	plan: LabelPlan,
): Promise<LabelChange[]> => {
	if (plan === null) return [];
	const { adds, removes } = plan;
	const current = new Map((await heldLabels(tx, row.id)).map((label) => [label.id, label]));
	const changes: LabelChange[] = [];
	const inserted: string[] = [];
	const deleted: string[] = [];
	for (const label of adds) {
		if (current.has(label.id)) continue;
		const replaced =
			label.group_id === null ? undefined : [...current.values()].find((other) => other.group_id === label.group_id);
		if (replaced === undefined) {
			changes.push({
				field: "labels",
				from: null,
				to: labelText(label),
				meta: { labelId: label.id, color: label.color, group: label.group_name },
			});
		} else {
			current.delete(replaced.id);
			deleted.push(replaced.id);
			changes.push({
				field: "labels",
				from: labelText(replaced),
				to: labelText(label),
				meta: { fromId: replaced.id, toId: label.id, color: label.color, group: label.group_name },
			});
		}
		current.set(label.id, held(label));
		inserted.push(label.id);
	}
	for (const label of removes) {
		if (!current.has(label.id)) continue;
		current.delete(label.id);
		deleted.push(label.id);
		changes.push({
			field: "labels",
			from: labelText(label),
			to: null,
			meta: { labelId: label.id, color: label.color, group: label.group_name },
		});
	}
	if (inserted.length > 0) await insertRows(tx, row.id, inserted, ctx.now);
	if (deleted.length > 0) {
		await tx.execute(
			sql`DELETE FROM ticket_labels WHERE ticket_id = ${row.id} AND label_id = ANY(${textArray(deleted)})`,
		);
	}
	return changes;
};

// The labels a new ticket starts with. Returns the number of labels written.
export const createTicketLabels = async (
	ctx: ServiceCtx,
	tx: Tx,
	input: { ticketId: string; rootId: string; refs: readonly string[] },
): Promise<number> => {
	const labels = await resolveLabels(ctx, tx, { rootId: input.rootId, refs: input.refs, field: "labels" });
	if (labels.length === 0) return 0;
	await insertRows(
		tx,
		input.ticketId,
		labels.map((label) => label.id),
		ctx.now,
	);
	return labels.length;
};
