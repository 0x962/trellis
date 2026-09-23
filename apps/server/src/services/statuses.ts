import type { Status, StatusCreateInput, StatusListOutput, StatusUpdateInput } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../context.ts";
import type { Tx } from "../db/tx.ts";
import { fail } from "../errors.ts";
import { changeSet } from "./changeSet.ts";
import { resolveMutableProject, resolveProject, resolveStatus, toSummary } from "./refs.ts";
import { deriveSlug } from "./slug.ts";
import {
	assertFreeName,
	emitStatusesChanged,
	insertStatus,
	renumber,
	statusActivity,
	statusById,
} from "./statusSet.ts";

export { delete } from "./statusesDelete.ts";
export { applyStatusTransition } from "./statusTransition.ts";

// Every project owns its set of statuses, and `statuses.changed` names the
// project whose set changed.

export type StatusReorderInput = { project: string; statuses: string[] };

// Appends at the next position, or at `position` with the set renumbered.
export const create = async (ctx: ServiceCtx, tx: Tx, input: StatusCreateInput): Promise<Status> => {
	const project = await resolveMutableProject(ctx, tx, input.project);
	const own = ctx.cache.statusesOf(project.id);
	const slug = deriveSlug(input.name);
	assertFreeName(own, input.name, slug);
	const isDefault = input.isDefault ?? false;
	if (isDefault) {
		await tx.execute(sql`UPDATE statuses SET is_default = false WHERE project_id = ${project.id} AND is_default`);
	}
	const id = ulid();
	await insertStatus(ctx, tx, {
		id,
		projectId: project.id,
		name: input.name,
		description: input.description ?? "",
		slug,
		category: input.category,
		color: input.color ?? "fg",
		position: own.length,
		isDefault,
	});
	if (input.position !== undefined) {
		const order = own.map((status) => status.id);
		order.splice(Math.min(input.position, own.length), 0, id);
		await renumber(tx, order);
	}
	await statusActivity(ctx, tx, project.id, "status.created", [
		{ field: null, from: null, to: input.name, meta: { statusId: id } },
	]);
	await ctx.cache.rebuild(tx);
	emitStatusesChanged(ctx, project.id);
	return statusById(ctx, project.id, id);
};

// `category` never changes; `isDefault: true` moves the one default onto
// this status.
export const update = async (ctx: ServiceCtx, tx: Tx, input: StatusUpdateInput): Promise<Status> => {
	if ("category" in input) throw fail("STATUS_CATEGORY_IMMUTABLE");
	const project = await resolveMutableProject(ctx, tx, input.project);
	const status = await resolveStatus(ctx, tx, { projectId: project.id, status: input.status });
	const { sets, changes, field } = changeSet();
	if (input.name !== undefined && input.name !== status.name) {
		const slug = deriveSlug(input.name);
		const others = ctx.cache.statusesOf(project.id).filter((other) => other.id !== status.id);
		assertFreeName(others, input.name, slug);
		sets.push(sql`slug = ${slug}`);
		field("name", status.name, input.name, sql`name = ${input.name}`);
	}
	field("description", status.description, input.description, sql`description = ${input.description}`);
	field("color", status.color, input.color, sql`color = ${input.color}`);
	if (input.isDefault === true && !status.isDefault) {
		await tx.execute(sql`UPDATE statuses SET is_default = false WHERE project_id = ${project.id} AND is_default`);
		field("isDefault", false, true, sql`is_default = true`);
	}
	if (changes.length === 0) return status;
	await tx.execute(
		sql`UPDATE statuses SET ${sql.join(sets, sql`, `)}, updated_at = ${ctx.now} WHERE id = ${status.id}`,
	);
	await statusActivity(ctx, tx, project.id, "status.updated", changes);
	await ctx.cache.rebuild(tx);
	emitStatusesChanged(ctx, project.id);
	return statusById(ctx, project.id, status.id);
};

// Takes the whole set in the new order and writes the positions 0 to n
// minus 1 on its rows.
export const reorder = async (ctx: ServiceCtx, tx: Tx, input: StatusReorderInput): Promise<StatusListOutput> => {
	const project = await resolveMutableProject(ctx, tx, input.project);
	const before = ctx.cache.statusesOf(project.id);
	const ids: string[] = [];
	for (const ref of input.statuses) {
		ids.push((await resolveStatus(ctx, tx, { projectId: project.id, status: ref })).id);
	}
	if (ids.length !== before.length || new Set(ids).size !== ids.length) {
		throw fail("STATUS_NOT_IN_PROJECT", { valid: before.map(toSummary) });
	}
	await renumber(tx, ids);
	await statusActivity(ctx, tx, project.id, "statuses.reordered", [
		{ field: "order", from: null, to: null, meta: { from: before.map((status) => status.id), to: ids } },
	]);
	await ctx.cache.rebuild(tx);
	emitStatusesChanged(ctx, project.id);
	return { statuses: ctx.cache.statusesOf(project.id) };
};

// The set of one project, in position order.
export const list = async (ctx: ServiceCtx, tx: Tx, input: { project: string }): Promise<StatusListOutput> => {
	const project = await resolveProject(ctx, tx, input.project);
	return { statuses: ctx.cache.statusesOf(project.id) };
};
