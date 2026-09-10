import type { Project, ProjectCreateInput, ProjectUpdateInput } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { requireActor, type ServiceCtx } from "../context.ts";
import { rows } from "../db/queries/support.ts";
import type { Tx } from "../db/tx.ts";
import { fail, invalidInput } from "../errors.ts";
import { changeSet } from "./changeSet.ts";
import { assertKeyFree, assertSlugFree, projectActivity, projectRow, projectView } from "./projectRows.ts";
import { assertProjectActive, pathOf, resolveProject } from "./refs.ts";
import { deriveSlug } from "./slug.ts";
import { seedRootStatuses } from "./statusSet.ts";

export { get } from "./projectRows.ts";
export { delete } from "./projectsDelete.ts";
export { list } from "./projectsList.ts";
export { move } from "./projectsMove.ts";
export { effectiveRepos, setRepos } from "./projectsRepos.ts";
export { setTrustedFolders } from "./projectsTrustedFolders.ts";

// Projects form a tree. A root has a key and the ticket counter of its tree.
// A sub-project has a parent in the same root and a slug, which is its path
// segment. A root owns the six seeded statuses; a sub-project inherits.

const nextPosition = async (tx: Tx, parentId: string | null) => {
	const found = await rows<{ n: number }>(
		tx,
		sql`SELECT count(*)::int AS n FROM projects WHERE parent_id IS NOT DISTINCT FROM ${parentId}`,
	);
	return found[0]!.n;
};

// The description a new ticket of a new root starts with, from product.md
// section 6.3. A sub-project starts with an empty template.
export const DEFAULT_TICKET_TEMPLATE = "## Context\n\n## Acceptance criteria\n- [ ]\n\n## Out of scope\n";

export const create = async (ctx: ServiceCtx, tx: Tx, input: ProjectCreateInput): Promise<Project> => {
	requireActor(ctx);
	const id = ulid();
	const parent = input.parent === undefined ? null : await resolveProject(ctx, tx, input.parent);
	if (parent !== null) assertProjectActive(ctx, parent.id);
	const key = parent === null ? (input.key as string) : null;
	const slug = parent === null ? (key as string).toLowerCase() : (input.slug ?? deriveSlug(input.name));
	if (parent === null) await assertKeyFree(tx, key as string);
	else await assertSlugFree(tx, parent.id, slug, null);
	const position = await nextPosition(tx, parent?.id ?? null);
	const template = input.ticketTemplate ?? (parent === null ? DEFAULT_TICKET_TEMPLATE : "");
	await tx.execute(
		sql`INSERT INTO projects (id, parent_id, root_id, key, slug, name, description, ticket_template, ticket_counter, position, archived_at, created_at, updated_at)
			VALUES (${id}, ${parent?.id ?? null}, ${parent?.rootId ?? id}, ${key}, ${slug}, ${input.name},
				${input.description ?? ""}, ${template}, 0, ${position}, NULL, ${ctx.now}, ${ctx.now})`,
	);
	if (parent === null) await seedRootStatuses(ctx, tx, id);
	await ctx.cache.rebuild(tx);
	await projectActivity(ctx, tx, id, "project.created", [
		{ field: null, from: null, to: input.name, meta: { path: pathOf(ctx.cache, id) } },
	]);
	ctx.emit({ type: "project.created", id });
	return projectView(ctx, tx, id);
};

// Writes one activity row per field that changes and nothing for a field
// sent back with its value. `archived: false` is the one change an archived
// project accepts. A key change is free until the first ticket is numbered.
export const update = async (ctx: ServiceCtx, tx: Tx, input: ProjectUpdateInput): Promise<Project> => {
	requireActor(ctx);
	const project = await resolveProject(ctx, tx, input.project);
	if (input.archived !== false) assertProjectActive(ctx, project.id);
	const row = await projectRow(tx, project.id);
	const { sets, changes, field } = changeSet();
	field("name", row.name, input.name, sql`name = ${input.name}`);
	field("description", row.description, input.description, sql`description = ${input.description}`);
	field("ticketTemplate", row.ticket_template, input.ticketTemplate, sql`ticket_template = ${input.ticketTemplate}`);
	if (input.slug !== undefined && input.slug !== project.slug) {
		if (project.parentId === null) throw invalidInput("slug", "A root takes its slug from its key.");
		await assertSlugFree(tx, project.parentId, input.slug, project.id);
		field("slug", project.slug, input.slug, sql`slug = ${input.slug}`);
	}
	if (input.key !== undefined && input.key !== project.key) {
		if (project.parentId !== null) throw invalidInput("key", "Only a root project has a key.");
		if (row.ticket_counter > 0) throw fail("KEY_LOCKED");
		await assertKeyFree(tx, input.key);
		sets.push(sql`slug = ${input.key.toLowerCase()}`);
		field("key", project.key, input.key, sql`key = ${input.key}`);
	}
	if (input.archived !== undefined) {
		const archived = row.archived_at !== null;
		field("archived", archived, input.archived, sql`archived_at = ${input.archived ? ctx.now : null}`);
	}
	if (changes.length === 0) return projectView(ctx, tx, project.id);
	await tx.execute(
		sql`UPDATE projects SET ${sql.join(sets, sql`, `)}, updated_at = ${ctx.now} WHERE id = ${project.id}`,
	);
	await projectActivity(ctx, tx, project.id, "project.updated", changes);
	await ctx.cache.rebuild(tx);
	ctx.emit({ type: "project.updated", id: project.id });
	return projectView(ctx, tx, project.id);
};
