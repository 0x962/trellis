import type {
	Label,
	LabelCreateInputSchema,
	LabelDeleteInputSchema,
	LabelDeleteOutputSchema,
	LabelListInputSchema,
	LabelListOutput,
	LabelUpdateInputSchema,
} from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { z } from "zod";
import type { ServiceCtx } from "../context.ts";
import { rows } from "../db/queries/support.ts";
import type { Tx } from "../db/tx.ts";
import { fail } from "../errors.ts";
import { changeSet } from "./changeSet.ts";
import { resolveLabelGroup } from "./labelRefs.ts";
import {
	assertGroupNameFree,
	assertTopLevelNameFree,
	autoColor,
	emitLabelsChanged,
	groupsOfProject,
	labelById,
	labelsOfProject,
	labelText,
	toGroup,
	toLabel,
} from "./labelRows.ts";
import { projectActivity } from "./projectRows.ts";
import { resolveMutableProject, resolveProject } from "./refs.ts";
import { assertAgentMayDelete } from "./tickets/rules.ts";

// A project owns its labels. A call names the project of the labels it
// project of the tree, and the service reads and writes the labels of its
// project. Every write records one project activity row and tells the
// clients of that project to read the labels again.

type ListInput = z.infer<typeof LabelListInputSchema>;
type CreateInput = z.infer<typeof LabelCreateInputSchema>;
type UpdateInput = z.infer<typeof LabelUpdateInputSchema>;
type DeleteInput = z.infer<typeof LabelDeleteInputSchema>;
type DeleteOutput = z.infer<typeof LabelDeleteOutputSchema>;

// The tickets that hold `labelId` and another label of `groupId`. A move of
// the label into that group would put two labels of one group on each of
// those tickets, and a ticket holds one label of a group at most.
const groupConflictCount = async (tx: Tx, labelId: string, groupId: string) => {
	const found = await rows<{ count: number }>(
		tx,
		sql`SELECT count(*)::int AS count FROM ticket_labels held
			WHERE held.label_id = ${labelId} AND EXISTS (
				SELECT 1 FROM ticket_labels other JOIN labels ol ON ol.id = other.label_id
				WHERE other.ticket_id = held.ticket_id AND ol.group_id = ${groupId} AND ol.id <> ${labelId})`,
	);
	return (found[0] as { count: number }).count;
};

export const list = async (ctx: ServiceCtx, tx: Tx, input: ListInput): Promise<LabelListOutput> => {
	const project = await resolveProject(ctx, tx, input.project);
	const groups = await groupsOfProject(tx, project.id);
	const labels = await labelsOfProject(tx, project.id);
	return { groups: groups.map(toGroup), labels: labels.map(toLabel) };
};

export const create = async (ctx: ServiceCtx, tx: Tx, input: CreateInput): Promise<Label> => {
	const project = await resolveMutableProject(ctx, tx, input.project);
	const projectId = project.id;
	const group = input.group === undefined ? null : await resolveLabelGroup(ctx, tx, { projectId, ref: input.group });
	if (group === null) await assertTopLevelNameFree(tx, projectId, input.name, {});
	else await assertGroupNameFree(tx, group.id, input.name, null);
	const id = ulid();
	const color = input.color ?? (await autoColor(tx, projectId));
	await tx.execute(
		sql`INSERT INTO labels (id, project_id, group_id, name, color, description, created_at, updated_at)
			VALUES (${id}, ${projectId}, ${group?.id ?? null}, ${input.name}, ${color}, ${input.description ?? ""},
				${ctx.now}, ${ctx.now})`,
	);
	const created = await labelById(tx, projectId, id);
	await projectActivity(ctx, tx, projectId, "label.created", [
		{ field: null, from: null, to: labelText(created), meta: { labelId: id, groupId: group?.id ?? null, color } },
	]);
	emitLabelsChanged(ctx, projectId);
	return toLabel(created);
};

export const update = async (ctx: ServiceCtx, tx: Tx, input: UpdateInput): Promise<Label> => {
	const project = await resolveMutableProject(ctx, tx, input.project);
	const projectId = project.id;
	const label = await labelById(tx, projectId, input.label);
	const group =
		input.group === undefined || input.group === null
			? null
			: await resolveLabelGroup(ctx, tx, { projectId, ref: input.group });
	const movesGroup = input.group !== undefined && (group?.id ?? null) !== label.group_id;
	const groupId = movesGroup ? (group?.id ?? null) : label.group_id;
	const name = input.name ?? label.name;
	if (movesGroup || name !== label.name) {
		if (groupId === null) await assertTopLevelNameFree(tx, projectId, name, { labelId: label.id });
		else await assertGroupNameFree(tx, groupId, name, label.id);
	}
	if (movesGroup && groupId !== null) {
		const count = await groupConflictCount(tx, label.id, groupId);
		if (count > 0) throw fail("LABEL_GROUP_CONFLICT", { count });
	}
	const { sets, changes, field } = changeSet();
	field("name", label.name, input.name, sql`name = ${input.name}`);
	field("color", label.color, input.color, sql`color = ${input.color}`);
	field("description", label.description, input.description, sql`description = ${input.description}`);
	if (movesGroup) {
		sets.push(sql`group_id = ${groupId}`);
		changes.push({ field: "group", from: label.group_name, to: group?.name ?? null });
	}
	if (changes.length === 0) return toLabel(label);
	await tx.execute(sql`UPDATE labels SET ${sql.join(sets, sql`, `)}, updated_at = ${ctx.now} WHERE id = ${label.id}`);
	await projectActivity(
		ctx,
		tx,
		projectId,
		"label.updated",
		changes.map((change) => ({ ...change, meta: { labelId: label.id } })),
	);
	emitLabelsChanged(ctx, projectId);
	return toLabel(await labelById(tx, projectId, label.id));
};

// A delete removes the label from every ticket that holds it, through the
// cascade of `ticket_labels`. It writes no ticket activity row and leaves
// `tickets.version` and `tickets.updated_at` alone; the clients of the project
// read the tickets again on `labels.changed`.
const remove = async (ctx: ServiceCtx, tx: Tx, input: DeleteInput): Promise<DeleteOutput> => {
	const project = await resolveMutableProject(ctx, tx, input.project);
	assertAgentMayDelete(ctx, input.force);
	const label = await labelById(tx, project.id, input.label);
	await tx.execute(sql`DELETE FROM labels WHERE id = ${label.id}`);
	await projectActivity(ctx, tx, project.id, "label.deleted", [
		{
			field: null,
			from: labelText(label),
			to: null,
			meta: { labelId: label.id, groupId: label.group_id, tickets: label.ticket_count },
		},
	]);
	emitLabelsChanged(ctx, project.id);
	return { deleted: label.id, tickets: label.ticket_count };
};

export { remove as delete };
