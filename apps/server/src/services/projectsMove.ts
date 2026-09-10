import type { Project, ProjectMoveInput } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../context.ts";
import type { CachedProject } from "../db/cache.ts";
import type { Tx } from "../db/tx.ts";
import { fail } from "../errors.ts";
import type { Change } from "./activity.ts";
import { assertSlugFree, projectActivity, projectView, siblingIds } from "./projectRows.ts";
import { assertProjectActive, resolveMutableProject, resolveProject } from "./refs.ts";
import { remapScope } from "./statusRemap.ts";
import { emitStatusesChanged } from "./statusSet.ts";

// Where the project sits after the move: its parent as it is, the top level
// of its root, or the parent the caller named. A root stays a root.
const targetParent = async (ctx: ServiceCtx, tx: Tx, project: CachedProject, input: ProjectMoveInput) => {
	if (input.parent === undefined) return project.parentId;
	if (project.parentId === null) throw fail("CROSS_ROOT_MOVE");
	if (input.parent === null) return project.rootId;
	const parent = await resolveProject(ctx, tx, input.parent);
	if (parent.rootId !== project.rootId) throw fail("CROSS_ROOT_MOVE");
	if (ctx.cache.resolveSubtree(project.id).includes(parent.id)) throw fail("PARENT_CYCLE");
	assertProjectActive(ctx, parent.id);
	return parent.id;
};

// The index the project takes among `siblings`, from the `after` or `before`
// anchor. Without an anchor a project that changes parent goes last.
const targetIndex = async (ctx: ServiceCtx, tx: Tx, siblings: string[], input: ProjectMoveInput) => {
	const anchorRef = input.after ?? input.before;
	if (anchorRef === undefined) return siblings.length;
	const anchor = await resolveProject(ctx, tx, anchorRef);
	const index = siblings.indexOf(anchor.id);
	if (index < 0) throw fail("INVALID_ANCHOR");
	return input.after === undefined ? index : index + 1;
};

// Re-parents a project inside its root, or reorders it among its siblings.
// When the move changes owner(P) for a project that owns no statuses, the
// tickets of its scope move onto the new owner's set.
export const move = async (ctx: ServiceCtx, tx: Tx, input: ProjectMoveInput): Promise<Project> => {
	const project = await resolveMutableProject(ctx, tx, input.project);
	const parentId = await targetParent(ctx, tx, project, input);
	const parentChanged = parentId !== project.parentId;
	if (!parentChanged && input.after === undefined && input.before === undefined) {
		return projectView(ctx, tx, project.id);
	}
	if (parentChanged) await assertSlugFree(tx, parentId as string, project.slug, project.id);
	const siblings = await siblingIds(tx, parentId, project.id);
	const index = await targetIndex(ctx, tx, siblings, input);
	const order = [...siblings];
	order.splice(index, 0, project.id);
	for (const [position, id] of order.entries()) {
		await tx.execute(sql`UPDATE projects SET position = ${position} WHERE id = ${id}`);
	}
	await tx.execute(sql`UPDATE projects SET parent_id = ${parentId}, updated_at = ${ctx.now} WHERE id = ${project.id}`);
	const changes: Change[] = parentChanged
		? [{ field: "parent", from: project.parentId, to: parentId }]
		: [{ field: "position", from: String(project.position), to: String(index) }];
	await projectActivity(ctx, tx, project.id, "project.moved", changes);
	if (parentChanged) {
		const oldOwner = ctx.cache.effectiveStatuses(project.id).ownerId;
		const newOwner = ctx.cache.effectiveStatuses(parentId as string).ownerId;
		if (oldOwner !== project.id && oldOwner !== newOwner) {
			await remapScope(ctx, tx, { projectId: project.id, toOwnerId: newOwner });
			emitStatusesChanged(ctx, project.id);
		}
	}
	await ctx.cache.rebuild(tx);
	ctx.emit({ type: "project.moved", id: project.id });
	return projectView(ctx, tx, project.id);
};
