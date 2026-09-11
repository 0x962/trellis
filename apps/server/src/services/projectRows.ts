import { type Project, type ProjectSummary, reservedSlugs } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../context.ts";
import {
	type ProjectSummaryRow,
	projectCtes,
	projectSummaryColumns,
	projectSummaryJoins,
	toProjectSummary,
} from "../db/queries/projectSummary.ts";
import { iso, rows } from "../db/queries/support.ts";
import type { Tx } from "../db/tx.ts";
import { fail } from "../errors.ts";
import { type Change, record } from "./activity.ts";
import { repoRows } from "./projectsRepos.ts";
import { chainOf, pathOf, resolveProject } from "./refs.ts";

// The row reads and the small writes the project services share. Every
// read goes to the database, so a view built at the end of a mutation shows
// the rows that mutation wrote.

type ProjectRow = ProjectSummaryRow & {
	description: string;
	ticket_template: string;
	manager_config: NonNullable<Project["managerConfig"]>;
	ticket_counter: number;
	created_at: string;
	updated_at: string;
};

const projectColumns = sql`${projectSummaryColumns}, p.description, p.manager_config, p.ticket_template, p.ticket_counter,
	${iso(sql`p.created_at`)} AS created_at, ${iso(sql`p.updated_at`)} AS updated_at`;

export const projectRow = async (tx: Tx, projectId: string) => {
	const found = await rows<ProjectRow>(
		tx,
		sql`WITH RECURSIVE ${projectCtes} SELECT ${projectColumns} ${projectSummaryJoins} WHERE p.id = ${projectId}`,
	);
	return found[0]!;
};

// The children of a project in display order.
export const childSummaries = async (tx: Tx, parentId: string): Promise<ProjectSummary[]> => {
	const found = await rows<ProjectSummaryRow>(
		tx,
		sql`WITH RECURSIVE ${projectCtes} SELECT ${projectSummaryColumns} ${projectSummaryJoins}
			WHERE p.parent_id = ${parentId} ORDER BY p.position, p.slug`,
	);
	return found.map(toProjectSummary);
};

// The ids of the projects under `parentId` (the roots when null), in display
// order, without `exceptId`.
export const siblingIds = async (tx: Tx, parentId: string | null, exceptId: string) => {
	const found = await rows<{ id: string }>(
		tx,
		sql`SELECT id FROM projects WHERE parent_id IS NOT DISTINCT FROM ${parentId} AND id <> ${exceptId}
			ORDER BY position, slug`,
	);
	return found.map((row) => row.id);
};

// A slug is one path segment under its parent, so two children of one parent
// never share one. The web routes `board` and `settings` are never a slug.
export const assertSlugFree = async (tx: Tx, parentId: string, slug: string, exceptId: string | null) => {
	if (reservedSlugs.has(slug)) throw fail("DUPLICATE", { field: "slug" });
	const found = await rows<{ id: string }>(
		tx,
		sql`SELECT id FROM projects WHERE parent_id = ${parentId} AND slug = ${slug} AND id IS DISTINCT FROM ${exceptId}`,
	);
	if (found.length > 0) throw fail("DUPLICATE", { field: "slug" });
};

export const assertKeyFree = async (tx: Tx, key: string) => {
	const found = await rows<{ id: string }>(tx, sql`SELECT id FROM projects WHERE key = ${key}`);
	if (found.length > 0) throw fail("DUPLICATE", { field: "key" });
};

// Two active root projects never share a name, compared without letter case.
// An archived root does not hold its name. `exceptId` is the root that the
// caller renames or restores, so a root never collides with its own name.
export const assertRootNameFree = async (tx: Tx, name: string, exceptId: string | null) => {
	const found = await rows<{ id: string }>(
		tx,
		sql`SELECT id FROM projects WHERE parent_id IS NULL AND archived_at IS NULL
			AND lower(name) = lower(${name}) AND id IS DISTINCT FROM ${exceptId}`,
	);
	if (found.length > 0) throw fail("DUPLICATE", { field: "name" });
};

// One project-level activity batch: `ticket_id` null, the project and its root.
export const projectActivity = (ctx: ServiceCtx, tx: Tx, projectId: string, action: string, changes: Change[]) =>
	record(ctx, tx, { rootId: ctx.cache.get(projectId).rootId, projectId, ticketId: null, action, changes });

// The full project of the contract: the summary, its own fields, the
// ancestors nearest last, the children, and the repos. `statuses` is the
// effective set, and `statusesInheritedFrom` names the owner it comes from.
export const projectView = async (ctx: ServiceCtx, tx: Tx, projectId: string): Promise<Project> => {
	const row = await projectRow(tx, projectId);
	const children = await childSummaries(tx, projectId);
	const repos = await repoRows(tx, [projectId]);
	const ancestors = chainOf(ctx.cache, projectId)
		.slice(1)
		.reverse()
		.map((ancestor) => ({
			id: ancestor.id,
			key: row.key,
			path: pathOf(ctx.cache, ancestor.id),
			slug: ancestor.slug,
			name: ancestor.name,
		}));
	const effective = ctx.cache.effectiveStatuses(projectId);
	return {
		...toProjectSummary(row),
		description: row.description,
		ticketTemplate: row.ticket_template,
		managerConfig: row.manager_config,
		ticketCounter: row.ticket_counter,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		ancestors,
		children,
		repos,
		statuses: effective.statuses,
		statusesInheritedFrom: effective.ownerId === projectId ? null : effective.ownerId,
	};
};

export const get = async (ctx: ServiceCtx, tx: Tx, input: { project: string }): Promise<Project> => {
	const project = await resolveProject(ctx, tx, input.project);
	return projectView(ctx, tx, project.id);
};
