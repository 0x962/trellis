import type { Label, LabelCreateInput, LabelGroup, LabelGroupCreateInput, LabelGroupListOutput } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../context.ts";
import { iso, rows } from "../db/queries/support.ts";
import type { Tx } from "../db/tx.ts";
import { fail } from "../errors.ts";
import { projectActivity } from "./projectRows.ts";
import { resolveMutableProject, resolveProject } from "./refs.ts";

type GroupRow = {
	id: string;
	project_id: string;
	name: string;
	position: number;
	created_at: string;
	updated_at: string;
};

type LabelRow = {
	id: string;
	group_id: string;
	name: string;
	color: Label["color"];
	position: number;
	created_at: string;
	updated_at: string;
};

const toLabel = (row: LabelRow): Label => ({
	id: row.id,
	groupId: row.group_id,
	name: row.name,
	color: row.color,
	position: row.position,
	createdAt: row.created_at,
	updatedAt: row.updated_at,
});

const toGroup = (row: GroupRow, labels: Label[] = []): LabelGroup => ({
	id: row.id,
	projectId: row.project_id,
	name: row.name,
	position: row.position,
	labels,
	createdAt: row.created_at,
	updatedAt: row.updated_at,
});

const groupColumns = sql`id, project_id, name, position,
	${iso(sql`created_at`)} AS created_at, ${iso(sql`updated_at`)} AS updated_at`;
const labelColumns = sql`id, group_id, name, color, position,
	${iso(sql`created_at`)} AS created_at, ${iso(sql`updated_at`)} AS updated_at`;

const assertFreeName = async (tx: Tx, table: "label_groups" | "labels", owner: string, name: string) => {
	const ownerColumn = table === "label_groups" ? "project_id" : "group_id";
	const found = await rows<{ id: string }>(
		tx,
		sql`SELECT id FROM ${sql.identifier(table)}
			WHERE ${sql.identifier(ownerColumn)} = ${owner} AND lower(name) = lower(${name})`,
	);
	if (found.length > 0) throw fail("DUPLICATE", { field: "name" });
};

const nextPosition = async (tx: Tx, table: "label_groups" | "labels", owner: string) => {
	const ownerColumn = table === "label_groups" ? "project_id" : "group_id";
	const found = await rows<{ position: number }>(
		tx,
		sql`SELECT coalesce(max(position), -1)::int + 1 AS position FROM ${sql.identifier(table)}
			WHERE ${sql.identifier(ownerColumn)} = ${owner}`,
	);
	return found[0]!.position;
};

const resolveGroup = async (tx: Tx, projectId: string, ref: string) => {
	const found = await rows<GroupRow>(
		tx,
		sql`SELECT ${groupColumns} FROM label_groups WHERE id = ${ref} AND project_id = ${projectId}`,
	);
	if (found.length === 0) throw fail("NOT_FOUND", { kind: "label group", ref });
	return found[0]!;
};

export const list = async (ctx: ServiceCtx, tx: Tx, input: { project: string }): Promise<LabelGroupListOutput> => {
	const project = await resolveProject(ctx, tx, input.project);
	const groups = await rows<GroupRow>(
		tx,
		sql`SELECT ${groupColumns} FROM label_groups WHERE project_id = ${project.id} ORDER BY position, id`,
	);
	if (groups.length === 0) return { groups: [] };
	const labels = await rows<LabelRow>(
		tx,
		sql`SELECT ${labelColumns} FROM labels
			WHERE group_id IN (${sql.join(
				groups.map((group) => sql`${group.id}`),
				sql`, `,
			)})
			ORDER BY position, id`,
	);
	const byGroup = Map.groupBy(labels.map(toLabel), (label) => label.groupId);
	return { groups: groups.map((group) => toGroup(group, byGroup.get(group.id) ?? [])) };
};

export const create = async (ctx: ServiceCtx, tx: Tx, input: LabelGroupCreateInput): Promise<LabelGroup> => {
	const project = await resolveMutableProject(ctx, tx, input.project);
	await assertFreeName(tx, "label_groups", project.id, input.name);
	const id = ulid();
	const position = await nextPosition(tx, "label_groups", project.id);
	await tx.execute(
		sql`INSERT INTO label_groups (id, project_id, name, position, created_at, updated_at)
			VALUES (${id}, ${project.id}, ${input.name}, ${position}, ${ctx.now}, ${ctx.now})`,
	);
	await projectActivity(ctx, tx, project.id, "label-group.created", [
		{ field: null, from: null, to: input.name, meta: { groupId: id } },
	]);
	ctx.emit({ type: "labels.changed", projectId: project.id });
	const [created] = await rows<GroupRow>(tx, sql`SELECT ${groupColumns} FROM label_groups WHERE id = ${id}`);
	return toGroup(created!);
};

export const createLabel = async (ctx: ServiceCtx, tx: Tx, input: LabelCreateInput): Promise<Label> => {
	const project = await resolveMutableProject(ctx, tx, input.project);
	const group = await resolveGroup(tx, project.id, input.group);
	await assertFreeName(tx, "labels", group.id, input.name);
	const id = ulid();
	const position = await nextPosition(tx, "labels", group.id);
	await tx.execute(
		sql`INSERT INTO labels (id, group_id, name, color, position, created_at, updated_at)
			VALUES (${id}, ${group.id}, ${input.name}, ${input.color ?? "fg-muted"}, ${position}, ${ctx.now}, ${ctx.now})`,
	);
	await projectActivity(ctx, tx, project.id, "label.created", [
		{ field: null, from: null, to: input.name, meta: { groupId: group.id, labelId: id } },
	]);
	ctx.emit({ type: "labels.changed", projectId: project.id });
	const [created] = await rows<LabelRow>(tx, sql`SELECT ${labelColumns} FROM labels WHERE id = ${id}`);
	return toLabel(created!);
};
