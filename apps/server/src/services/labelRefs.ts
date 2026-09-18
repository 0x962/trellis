import { LabelGroupRefSchema, LabelRefSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../context.ts";
import { rows } from "../db/queries/support.ts";
import type { Tx } from "../db/tx.ts";
import { fail, invalidInput } from "../errors.ts";
import {
	type GroupRow,
	groupById,
	groupColumns,
	type LabelRow,
	labelById,
	labelColumns,
	labelFrom,
	labelText,
} from "./labelRows.ts";

// A label ref is a ULID, a label name, or `group/name`. A name matches
// without regard to case. A bare name names the label with no group first,
// and then the one label of that name inside a group. Two labels of that name
// inside two groups make the ref ambiguous, and the caller must name the
// group. A label group ref is a ULID or a group name.

export type ResolveLabelInput = { rootId: string; ref: string };

export const resolveLabel = async (_ctx: ServiceCtx, tx: Tx, input: ResolveLabelInput): Promise<LabelRow> => {
	const parsed = LabelRefSchema.safeParse(input.ref);
	if (!parsed.success) throw fail("NOT_FOUND", { kind: "label", ref: input.ref });
	const ref = parsed.data;
	if (ref.kind === "ulid") return labelById(tx, input.rootId, ref.id);
	const canonical = LabelRefSchema.canonicalize(input.ref);
	const named =
		ref.group === null
			? sql`lower(l.name) = ${ref.name}`
			: sql`lower(g.name) = ${ref.group} AND lower(l.name) = ${ref.name}`;
	// The label with no group sorts first, so it answers a bare name.
	const found = await rows<LabelRow>(
		tx,
		sql`SELECT ${labelColumns} ${labelFrom}
			WHERE l.project_id = ${input.rootId} AND ${named}
			ORDER BY (l.group_id IS NOT NULL), lower(g.name), l.id`,
	);
	if (found.length === 0) throw fail("NOT_FOUND", { kind: "label", ref: canonical });
	const first = found[0] as LabelRow;
	if (first.group_id !== null && found.length > 1) {
		throw fail("LABEL_AMBIGUOUS", { matches: found.map(labelText) });
	}
	return first;
};

// `field` is the input field the message names, such as `addLabels`.
export type ResolveLabelsInput = { rootId: string; refs: readonly string[]; field: string };

// The labels of one list, in the order the caller names them, without a
// repeat. A ticket holds one label of a group at most, so two labels of one
// group in one list are an input error.
export const resolveLabels = async (ctx: ServiceCtx, tx: Tx, input: ResolveLabelsInput): Promise<LabelRow[]> => {
	const found: LabelRow[] = [];
	for (const ref of input.refs) {
		const label = await resolveLabel(ctx, tx, { rootId: input.rootId, ref });
		if (found.some((other) => other.id === label.id)) continue;
		const clash = found.find((other) => other.group_id !== null && other.group_id === label.group_id);
		if (clash !== undefined) {
			throw invalidInput(
				input.field,
				`A ticket holds one label of the group "${label.group_name}" at most. Name "${labelText(clash)}" or "${labelText(label)}", not both.`,
			);
		}
		found.push(label);
	}
	return found;
};

export type ResolveLabelGroupInput = { rootId: string; ref: string };

export const resolveLabelGroup = async (_ctx: ServiceCtx, tx: Tx, input: ResolveLabelGroupInput): Promise<GroupRow> => {
	const parsed = LabelGroupRefSchema.safeParse(input.ref);
	if (!parsed.success) throw fail("NOT_FOUND", { kind: "label group", ref: input.ref });
	if (parsed.data.kind === "ulid") return groupById(tx, input.rootId, parsed.data.id);
	const canonical = LabelGroupRefSchema.canonicalize(input.ref);
	const found = await rows<GroupRow>(
		tx,
		sql`SELECT ${groupColumns} FROM label_groups
			WHERE project_id = ${input.rootId} AND lower(name) = ${parsed.data.name}`,
	);
	if (found.length === 0) throw fail("NOT_FOUND", { kind: "label group", ref: canonical });
	return found[0] as GroupRow;
};

// The label ids a list filter names. Inside one root a ref resolves as a
// write ref does. With no root, which is a list across every project, a name
// matches the label of that name in every root and a ULID matches one label.
// A ref that names no label is refused, so a typo never reads as an empty filter.
export const labelFilterIds = async (
	ctx: ServiceCtx,
	tx: Tx,
	refs: readonly string[],
	rootId: string | null,
): Promise<string[]> => {
	const ids: string[] = [];
	for (const ref of refs) {
		if (rootId !== null) {
			ids.push((await resolveLabel(ctx, tx, { rootId, ref })).id);
			continue;
		}
		const parsed = LabelRefSchema.safeParse(ref);
		if (!parsed.success) throw fail("NOT_FOUND", { kind: "label", ref });
		const where =
			parsed.data.kind === "ulid"
				? sql`l.id = ${parsed.data.id}`
				: parsed.data.group === null
					? sql`lower(l.name) = ${parsed.data.name}`
					: sql`lower(g.name) = ${parsed.data.group} AND lower(l.name) = ${parsed.data.name}`;
		const found = await rows<{ id: string }>(tx, sql`SELECT l.id ${labelFrom} WHERE ${where}`);
		if (found.length === 0) throw fail("NOT_FOUND", { kind: "label", ref: LabelRefSchema.canonicalize(ref) });
		for (const row of found) ids.push(row.id);
	}
	return [...new Set(ids)];
};
