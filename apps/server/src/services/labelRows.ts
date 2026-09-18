import type { Label, LabelColor, LabelGroup } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../context.ts";
import { iso, rows } from "../db/queries/support.ts";
import type { Tx } from "../db/tx.ts";
import { fail } from "../errors.ts";

// The row reads and the name rules that `labels.ts`, `labelGroups.ts`, and
// `labelRefs.ts` share. The root project of a tree owns every label and every
// label group of the tree, so every statement here takes the id of that root.
// Every list is in name order, without regard to case.

export type LabelRow = {
	id: string;
	project_id: string;
	group_id: string | null;
	group_name: string | null;
	name: string;
	color: LabelColor;
	description: string;
	ticket_count: number;
	created_at: string;
	updated_at: string;
};

export type GroupRow = {
	id: string;
	project_id: string;
	name: string;
	created_at: string;
	updated_at: string;
};

export const labelColumns = sql`l.id, l.project_id, l.group_id, g.name AS group_name, l.name, l.color, l.description,
	(SELECT count(*)::int FROM ticket_labels tl WHERE tl.label_id = l.id) AS ticket_count,
	${iso(sql`l.created_at`)} AS created_at, ${iso(sql`l.updated_at`)} AS updated_at`;

// The label with the name of its group. Every label read joins this way, so
// `group_name` is null for a label with no group.
export const labelFrom = sql`FROM labels l LEFT JOIN label_groups g ON g.id = l.group_id`;

export const groupColumns = sql`id, project_id, name,
	${iso(sql`created_at`)} AS created_at, ${iso(sql`updated_at`)} AS updated_at`;

export const toLabel = (row: LabelRow): Label => ({
	id: row.id,
	projectId: row.project_id,
	groupId: row.group_id,
	name: row.name,
	color: row.color,
	description: row.description,
	ticketCount: row.ticket_count,
	createdAt: row.created_at,
	updatedAt: row.updated_at,
});

export const toGroup = (row: GroupRow): LabelGroup => ({
	id: row.id,
	projectId: row.project_id,
	name: row.name,
	createdAt: row.created_at,
	updatedAt: row.updated_at,
});

// The name a person reads: `group/name` for a label of a group, and the label
// name alone for a label with no group.
export const labelText = (row: { name: string; group_name: string | null }) =>
	row.group_name === null ? row.name : `${row.group_name}/${row.name}`;

export const labelsOfRoot = (tx: Tx, rootId: string) =>
	rows<LabelRow>(
		tx,
		sql`SELECT ${labelColumns} ${labelFrom} WHERE l.project_id = ${rootId} ORDER BY lower(l.name), l.id`,
	);

export const groupsOfRoot = (tx: Tx, rootId: string) =>
	rows<GroupRow>(
		tx,
		sql`SELECT ${groupColumns} FROM label_groups WHERE project_id = ${rootId} ORDER BY lower(name), id`,
	);

export const labelById = async (tx: Tx, rootId: string, id: string) => {
	const found = await rows<LabelRow>(
		tx,
		sql`SELECT ${labelColumns} ${labelFrom} WHERE l.id = ${id} AND l.project_id = ${rootId}`,
	);
	if (found.length === 0) throw fail("NOT_FOUND", { kind: "label", ref: id });
	return found[0] as LabelRow;
};

export const groupById = async (tx: Tx, rootId: string, id: string) => {
	const found = await rows<GroupRow>(
		tx,
		sql`SELECT ${groupColumns} FROM label_groups WHERE id = ${id} AND project_id = ${rootId}`,
	);
	if (found.length === 0) throw fail("NOT_FOUND", { kind: "label group", ref: id });
	return found[0] as GroupRow;
};

// A label with no group and a label group of one root share one namespace,
// because the ref `bug` names either one. `except` names the row the caller
// creates or renames, so a row never collides with itself.
export const assertTopLevelNameFree = async (
	tx: Tx,
	rootId: string,
	name: string,
	except: { labelId?: string; groupId?: string },
) => {
	const found = await rows<{ id: string }>(
		tx,
		sql`SELECT id FROM labels
			WHERE project_id = ${rootId} AND group_id IS NULL AND lower(name) = lower(${name})
				AND id IS DISTINCT FROM ${except.labelId ?? null}
			UNION ALL
			SELECT id FROM label_groups
			WHERE project_id = ${rootId} AND lower(name) = lower(${name})
				AND id IS DISTINCT FROM ${except.groupId ?? null}`,
	);
	if (found.length > 0) throw fail("DUPLICATE", { field: "name" });
};

// A label name is unique among the labels of its group.
export const assertGroupNameFree = async (tx: Tx, groupId: string, name: string, exceptLabelId: string | null) => {
	const found = await rows<{ id: string }>(
		tx,
		sql`SELECT id FROM labels
			WHERE group_id = ${groupId} AND lower(name) = lower(${name}) AND id IS DISTINCT FROM ${exceptLabelId}`,
	);
	if (found.length > 0) throw fail("DUPLICATE", { field: "name" });
};

// The order a create with no color walks. `gray` comes last, so the first
// labels of a project take a hue that a person tells apart at a glance.
const AUTO_COLORS = [
	"red",
	"orange",
	"yellow",
	"green",
	"teal",
	"blue",
	"purple",
	"pink",
	"gray",
] as const satisfies readonly LabelColor[];

// The first hue that no label of the root uses. When every hue is in use, the
// hue with the fewest labels, and the first hue of the order on a tie.
export const autoColor = async (tx: Tx, rootId: string): Promise<LabelColor> => {
	const used = await rows<{ color: LabelColor; count: number }>(
		tx,
		sql`SELECT color, count(*)::int AS count FROM labels WHERE project_id = ${rootId} GROUP BY color`,
	);
	const counts = new Map(used.map((row) => [row.color, row.count]));
	let best: LabelColor = AUTO_COLORS[0];
	let fewest = counts.get(best) ?? 0;
	for (const color of AUTO_COLORS) {
		const count = counts.get(color) ?? 0;
		if (count === 0) return color;
		if (count < fewest) {
			best = color;
			fewest = count;
		}
	}
	return best;
};

// Every label write and every label group write tells the clients of the root
// to read the labels again. A ticket row carries the name and the color of
// each of its labels, so a rename and a recolor reach the tickets this way.
export const emitLabelsChanged = (ctx: ServiceCtx, rootId: string) =>
	ctx.emit({ type: "labels.changed", projectId: rootId });
