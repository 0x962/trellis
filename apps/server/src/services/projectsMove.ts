import type { Project, ProjectMoveInput } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../context.ts";
import type { Tx } from "../db/tx.ts";
import { fail } from "../errors.ts";
import { projectActivity, projectView, siblingIds } from "./projectRows.ts";
import { resolveMutableProject, resolveProject } from "./refs.ts";

// The index the project takes among `siblings`, from the `after` or `before`
// anchor.
const targetIndex = async (ctx: ServiceCtx, tx: Tx, siblings: string[], input: ProjectMoveInput) => {
	const anchorRef = input.after ?? input.before;
	if (anchorRef === undefined) return siblings.length;
	const anchor = await resolveProject(ctx, tx, anchorRef);
	const index = siblings.indexOf(anchor.id);
	if (index < 0) throw fail("INVALID_ANCHOR");
	return input.after === undefined ? index : index + 1;
};

// Reorders a project in the list.
export const move = async (ctx: ServiceCtx, tx: Tx, input: ProjectMoveInput): Promise<Project> => {
	const project = await resolveMutableProject(ctx, tx, input.project);
	if (input.after === undefined && input.before === undefined) return projectView(ctx, tx, project.id);
	const siblings = await siblingIds(tx, project.id);
	const index = await targetIndex(ctx, tx, siblings, input);
	const order = [...siblings];
	order.splice(index, 0, project.id);
	for (const [position, id] of order.entries()) {
		await tx.execute(sql`UPDATE projects SET position = ${position} WHERE id = ${id}`);
	}
	await tx.execute(sql`UPDATE projects SET updated_at = ${ctx.now} WHERE id = ${project.id}`);
	await projectActivity(ctx, tx, project.id, "project.moved", [
		{ field: "position", from: String(project.position), to: String(index) },
	]);
	await ctx.cache.rebuild(tx);
	ctx.emit({ type: "project.moved", id: project.id });
	return projectView(ctx, tx, project.id);
};
