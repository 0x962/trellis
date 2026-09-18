import type {
	LabelGroup,
	LabelGroupCreateInputSchema,
	LabelGroupDeleteInputSchema,
	LabelGroupDeleteOutputSchema,
	LabelGroupUpdateInputSchema,
} from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { z } from "zod";
import type { ServiceCtx } from "../context.ts";
import { rows } from "../db/queries/support.ts";
import type { Tx } from "../db/tx.ts";
import {
	assertTopLevelNameFree,
	emitLabelsChanged,
	type GroupRow,
	groupById,
	groupColumns,
	toGroup,
} from "./labelRows.ts";
import { projectActivity } from "./projectRows.ts";
import { resolveMutableProject } from "./refs.ts";
import { assertAgentMayDelete } from "./tickets/rules.ts";

// A label group holds labels that exclude each other: a ticket carries one
// label of the group at most. The root project of a tree owns every group of
// the tree. `labels.list` returns the groups with the labels, so this service
// writes only.

type CreateInput = z.infer<typeof LabelGroupCreateInputSchema>;
type UpdateInput = z.infer<typeof LabelGroupUpdateInputSchema>;
type DeleteInput = z.infer<typeof LabelGroupDeleteInputSchema>;
type DeleteOutput = z.infer<typeof LabelGroupDeleteOutputSchema>;

const groupRow = async (tx: Tx, id: string) => {
	const found = await rows<GroupRow>(tx, sql`SELECT ${groupColumns} FROM label_groups WHERE id = ${id}`);
	return found[0] as GroupRow;
};

export const create = async (ctx: ServiceCtx, tx: Tx, input: CreateInput): Promise<LabelGroup> => {
	const project = await resolveMutableProject(ctx, tx, input.project);
	const rootId = project.rootId;
	await assertTopLevelNameFree(tx, rootId, input.name, {});
	const id = ulid();
	await tx.execute(
		sql`INSERT INTO label_groups (id, project_id, name, created_at, updated_at)
			VALUES (${id}, ${rootId}, ${input.name}, ${ctx.now}, ${ctx.now})`,
	);
	await projectActivity(ctx, tx, rootId, "label-group.created", [
		{ field: null, from: null, to: input.name, meta: { groupId: id } },
	]);
	emitLabelsChanged(ctx, rootId);
	return toGroup(await groupRow(tx, id));
};

export const update = async (ctx: ServiceCtx, tx: Tx, input: UpdateInput): Promise<LabelGroup> => {
	const project = await resolveMutableProject(ctx, tx, input.project);
	const rootId = project.rootId;
	const group = await groupById(tx, rootId, input.group);
	if (input.name === group.name) return toGroup(group);
	await assertTopLevelNameFree(tx, rootId, input.name, { groupId: group.id });
	await tx.execute(sql`UPDATE label_groups SET name = ${input.name}, updated_at = ${ctx.now} WHERE id = ${group.id}`);
	await projectActivity(ctx, tx, rootId, "label-group.updated", [
		{ field: "name", from: group.name, to: input.name, meta: { groupId: group.id } },
	]);
	emitLabelsChanged(ctx, rootId);
	return toGroup(await groupRow(tx, group.id));
};

// `labels: "ungroup"` keeps each label of the group as a label with no group.
// A label with no group shares its namespace with the group names of the
// root, so a name that another label or another group holds already refuses
// the whole call. `labels: "delete"` deletes the labels of the group with it,
// and the cascade of `ticket_labels` takes them off every ticket.
const remove = async (ctx: ServiceCtx, tx: Tx, input: DeleteInput): Promise<DeleteOutput> => {
	const project = await resolveMutableProject(ctx, tx, input.project);
	assertAgentMayDelete(ctx, input.force);
	const rootId = project.rootId;
	const group = await groupById(tx, rootId, input.group);
	const labels = await rows<{ id: string; name: string }>(
		tx,
		sql`SELECT id, name FROM labels WHERE group_id = ${group.id} ORDER BY lower(name), id`,
	);
	const ungroups = input.labels === "ungroup";
	if (ungroups) {
		for (const label of labels) {
			await assertTopLevelNameFree(tx, rootId, label.name, { labelId: label.id, groupId: group.id });
		}
		await tx.execute(sql`UPDATE labels SET group_id = NULL, updated_at = ${ctx.now} WHERE group_id = ${group.id}`);
	}
	await tx.execute(sql`DELETE FROM label_groups WHERE id = ${group.id}`);
	const ungrouped = ungroups ? labels.length : 0;
	const deletedLabels = ungroups ? 0 : labels.length;
	await projectActivity(ctx, tx, rootId, "label-group.deleted", [
		{ field: null, from: group.name, to: null, meta: { groupId: group.id, ungrouped, deletedLabels } },
	]);
	emitLabelsChanged(ctx, rootId);
	return { deleted: group.id, ungrouped, deletedLabels };
};

export { remove as delete };
