import type { Project, ProjectCreateInput, ProjectUpdateInput } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { requireActor, type ServiceCtx } from "../context.ts";
import { rows } from "../db/queries/support.ts";
import type { Tx } from "../db/tx.ts";
import { fail } from "../errors.ts";
import { changeSet } from "./changeSet.ts";
import {
	assertKeyFree,
	assertNameFree,
	assertSlugFree,
	projectActivity,
	projectRow,
	projectView,
} from "./projectRows.ts";
import { assertProjectActive, resolveProject } from "./refs.ts";
import { seedStatuses } from "./statusSet.ts";

export { get } from "./projectRows.ts";
export { delete } from "./projectsDelete.ts";
export { list } from "./projectsList.ts";
export { move } from "./projectsMove.ts";
export { projectRepos, setRepos } from "./projectsRepos.ts";

// Every project stands on its own. It owns a key, the counter that numbers
// its tickets, and the six seeded statuses.

const nextPosition = async (tx: Tx) => {
	const found = await rows<{ n: number }>(tx, sql`SELECT count(*)::int AS n FROM projects`);
	return found[0]!.n;
};

// The description a new ticket of a new project starts with.
export const DEFAULT_TICKET_TEMPLATE = "## Context\n\n## Acceptance criteria\n- [ ]\n\n## Out of scope\n";

// The slug of a new project is the lower-case spelling of its key. A key
// already answers to `slugPattern`, so the slug needs no other rule.
export const create = async (ctx: ServiceCtx, tx: Tx, input: ProjectCreateInput): Promise<Project> => {
	requireActor(ctx);
	const id = ulid();
	const slug = input.key.toLowerCase();
	await assertKeyFree(tx, input.key);
	await assertSlugFree(tx, slug, null);
	await assertNameFree(tx, input.name, null);
	const position = await nextPosition(tx);
	await tx.execute(
		sql`INSERT INTO projects (id, key, slug, name, description, directory, ticket_template, ticket_counter, position, archived_at, created_at, updated_at)
			VALUES (${id}, ${input.key}, ${slug}, ${input.name}, ${input.description ?? ""}, ${input.directory ?? ""},
				${input.ticketTemplate ?? DEFAULT_TICKET_TEMPLATE}, 0, ${position}, NULL, ${ctx.now}, ${ctx.now})`,
	);
	await seedStatuses(ctx, tx, id);
	await ctx.cache.rebuild(tx);
	await projectActivity(ctx, tx, id, "project.created", [
		{ field: null, from: null, to: input.name, meta: { path: input.key } },
	]);
	ctx.emit({ type: "project.created", id });
	return projectView(ctx, tx, id);
};

// Writes one activity row per field that changes and nothing for a field
// sent back with its value. `archived: false` is the one change an archived
// project accepts. A key change is free until the first ticket is numbered,
// and it moves the slug with it. A project that gets a new name or comes
// back from the archive must not take the name of another active project.
export const update = async (ctx: ServiceCtx, tx: Tx, input: ProjectUpdateInput): Promise<Project> => {
	requireActor(ctx);
	const project = await resolveProject(ctx, tx, input.project);
	if (input.archived !== false) assertProjectActive(ctx, project.id);
	const row = await projectRow(tx, project.id);
	const renamed = input.name !== undefined && input.name !== row.name;
	const restored = input.archived === false && row.archived_at !== null;
	if (renamed || restored) await assertNameFree(tx, input.name ?? row.name, project.id);
	const { sets, changes, field } = changeSet();
	field("name", row.name, input.name, sql`name = ${input.name}`);
	field("description", row.description, input.description, sql`description = ${input.description}`);
	field("directory", row.directory, input.directory, sql`directory = ${input.directory}`);
	field("ticketTemplate", row.ticket_template, input.ticketTemplate, sql`ticket_template = ${input.ticketTemplate}`);
	if (input.key !== undefined && input.key !== project.key) {
		if (row.ticket_counter > 0) throw fail("KEY_LOCKED");
		await assertKeyFree(tx, input.key);
		await assertSlugFree(tx, input.key.toLowerCase(), project.id);
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
