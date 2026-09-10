import type { Status, StatusCreateInput, StatusListOutput, StatusUpdateInput } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../context.ts";
import type { Tx } from "../db/tx.ts";
import { fail, invalidInput } from "../errors.ts";
import { changeSet } from "./changeSet.ts";
import { resolveMutableProject, resolveProject, resolveStatus, toSummary } from "./refs.ts";
import { deriveSlug } from "./slug.ts";
import {
	assertFreeName,
	emitStatusesChanged,
	insertStatus,
	materialize,
	ownedStatuses,
	renumber,
	statusActivity,
	statusById,
} from "./statusSet.ts";

export { clear, delete } from "./statusesDelete.ts";
export { remapScope } from "./statusRemap.ts";
export { applyStatusTransition } from "./statusTransition.ts";

// Statuses belong to a project. A root owns its set. A sub-project inherits
// the nearest owner's set until it creates a status of its own. That first
// create copies the set onto the sub-project. Every edit lands on the
// owner's row, and `statuses.changed` names the owner whose set changed.

export type StatusReorderInput = { project: string; statuses: string[] };

// Appends at the next position, or at `position` with the set renumbered.
export const create = async (ctx: ServiceCtx, tx: Tx, input: StatusCreateInput): Promise<Status> => {
	const project = await resolveMutableProject(ctx, tx, input.project);
	const effective = ctx.cache.effectiveStatuses(project.id);
	const slug = deriveSlug(input.name);
	assertFreeName(effective.statuses, input.name, slug);
	const inherits = effective.ownerId !== project.id;
	if (inherits) await materialize(ctx, tx, project.id);
	const own = inherits ? await ownedStatuses(tx, project.id) : effective.statuses;
	const isDefault = input.isDefault ?? false;
	if (isDefault) {
		await tx.execute(sql`UPDATE statuses SET is_default = false WHERE project_id = ${project.id} AND is_default`);
	}
	const id = ulid();
	await insertStatus(ctx, tx, {
		id,
		projectId: project.id,
		name: input.name,
		slug,
		category: input.category,
		reviewer: input.reviewer ?? null,
		color: input.color ?? "fg",
		position: own.length,
		wipLimit: input.wipLimit ?? null,
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

// Edits the owner's row. `category` never changes; `isDefault: true` moves
// the one default onto this status; a reviewer needs a review status.
export const update = async (ctx: ServiceCtx, tx: Tx, input: StatusUpdateInput): Promise<Status> => {
	if ("category" in input) throw fail("STATUS_CATEGORY_IMMUTABLE");
	const project = await resolveMutableProject(ctx, tx, input.project);
	const status = await resolveStatus(ctx, tx, { projectId: project.id, status: input.status });
	if (input.reviewer !== undefined && status.category !== "review") {
		throw invalidInput("reviewer", "Only a review status carries a reviewer.");
	}
	const owner = status.projectId;
	const { sets, changes, field } = changeSet();
	if (input.name !== undefined && input.name !== status.name) {
		const slug = deriveSlug(input.name);
		const others = ctx.cache.effectiveStatuses(owner).statuses.filter((other) => other.id !== status.id);
		assertFreeName(others, input.name, slug);
		sets.push(sql`slug = ${slug}`);
		field("name", status.name, input.name, sql`name = ${input.name}`);
	}
	field("color", status.color, input.color, sql`color = ${input.color}`);
	field("reviewer", status.reviewer, input.reviewer, sql`reviewer = ${input.reviewer}`);
	field("wipLimit", status.wipLimit, input.wipLimit, sql`wip_limit = ${input.wipLimit}`);
	if (input.isDefault === true && !status.isDefault) {
		await tx.execute(sql`UPDATE statuses SET is_default = false WHERE project_id = ${owner} AND is_default`);
		field("isDefault", false, true, sql`is_default = true`);
	}
	if (changes.length === 0) return status;
	await tx.execute(
		sql`UPDATE statuses SET ${sql.join(sets, sql`, `)}, updated_at = ${ctx.now} WHERE id = ${status.id}`,
	);
	await statusActivity(ctx, tx, owner, "status.updated", changes);
	await ctx.cache.rebuild(tx);
	emitStatusesChanged(ctx, owner);
	return statusById(ctx, owner, status.id);
};

// Takes the whole effective set in the new order and writes the positions
// 0 to n minus 1 on the owner's rows.
export const reorder = async (ctx: ServiceCtx, tx: Tx, input: StatusReorderInput): Promise<StatusListOutput> => {
	const project = await resolveMutableProject(ctx, tx, input.project);
	const effective = ctx.cache.effectiveStatuses(project.id);
	const ids: string[] = [];
	for (const ref of input.statuses) {
		ids.push((await resolveStatus(ctx, tx, { projectId: project.id, status: ref })).id);
	}
	if (ids.length !== effective.statuses.length || new Set(ids).size !== ids.length) {
		throw fail("STATUS_NOT_IN_PROJECT", { valid: effective.statuses.map(toSummary) });
	}
	await renumber(tx, ids);
	await statusActivity(ctx, tx, effective.ownerId, "statuses.reordered", [
		{ field: "order", from: null, to: null, meta: { from: effective.statuses.map((status) => status.id), to: ids } },
	]);
	await ctx.cache.rebuild(tx);
	emitStatusesChanged(ctx, effective.ownerId);
	const after = ctx.cache.effectiveStatuses(project.id);
	return { statuses: after.statuses, inheritedFrom: after.ownerId === project.id ? null : after.ownerId };
};

// The set a project works with: its own, or the owner's, with the owner
// named when it is another project.
export const list = async (ctx: ServiceCtx, tx: Tx, input: { project: string }): Promise<StatusListOutput> => {
	const project = await resolveProject(ctx, tx, input.project);
	const effective = ctx.cache.effectiveStatuses(project.id);
	return { statuses: effective.statuses, inheritedFrom: effective.ownerId === project.id ? null : effective.ownerId };
};
