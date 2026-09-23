import { type Project, reservedSlugs } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../context.ts";
import {
	type ProjectSummaryRow,
	projectSummaryColumns,
	projectSummaryJoins,
	toProjectSummary,
} from "../db/queries/projectSummary.ts";
import { iso, rows } from "../db/queries/support.ts";
import type { Tx } from "../db/tx.ts";
import { fail } from "../errors.ts";
import { type Change, record } from "./activity.ts";
import { repoRows } from "./projectsRepos.ts";
import { resolveProject } from "./refs.ts";

// The row reads and the small writes the project services share. Every
// read goes to the database, so a view built at the end of a mutation shows
// the rows that mutation wrote.

type ProjectRow = ProjectSummaryRow & {
	description: string;
	directory: string;
	ticket_template: string;
	ticket_counter: number;
	created_at: string;
	updated_at: string;
};

const projectColumns = sql`${projectSummaryColumns}, p.description, p.directory, p.ticket_template, p.ticket_counter,
	${iso(sql`p.created_at`)} AS created_at, ${iso(sql`p.updated_at`)} AS updated_at`;

export const projectRow = async (tx: Tx, projectId: string) => {
	const found = await rows<ProjectRow>(
		tx,
		sql`SELECT ${projectColumns} ${projectSummaryJoins} WHERE p.id = ${projectId}`,
	);
	return found[0]!;
};

// The ids of every project in display order, without `exceptId`.
export const siblingIds = async (tx: Tx, exceptId: string) => {
	const found = await rows<{ id: string }>(
		tx,
		sql`SELECT id FROM projects WHERE id <> ${exceptId} ORDER BY position, slug`,
	);
	return found.map((row) => row.id);
};

// A slug names one project, so two projects never share one. The web routes
// `board` and `settings` are never a slug.
export const assertSlugFree = async (tx: Tx, slug: string, exceptId: string | null) => {
	if (reservedSlugs.has(slug)) throw fail("DUPLICATE", { field: "slug" });
	const found = await rows<{ id: string }>(
		tx,
		sql`SELECT id FROM projects WHERE slug = ${slug} AND id IS DISTINCT FROM ${exceptId}`,
	);
	if (found.length > 0) throw fail("DUPLICATE", { field: "slug" });
};

export const assertKeyFree = async (tx: Tx, key: string) => {
	const found = await rows<{ id: string }>(tx, sql`SELECT id FROM projects WHERE key = ${key}`);
	if (found.length > 0) throw fail("DUPLICATE", { field: "key" });
};

// Two active projects never share a name, compared without letter case.
// An archived project does not hold its name. `exceptId` is the project that
// the caller renames or restores, so a project never collides with its own
// name.
export const assertNameFree = async (tx: Tx, name: string, exceptId: string | null) => {
	const found = await rows<{ id: string }>(
		tx,
		sql`SELECT id FROM projects WHERE archived_at IS NULL
			AND lower(name) = lower(${name}) AND id IS DISTINCT FROM ${exceptId}`,
	);
	if (found.length > 0) throw fail("DUPLICATE", { field: "name" });
};

// One project-level activity batch: `ticket_id` null and the project.
export const projectActivity = (ctx: ServiceCtx, tx: Tx, projectId: string, action: string, changes: Change[]) =>
	record(ctx, tx, { projectId, ticketId: null, action, changes });

// The full project of the contract: the summary, its own fields, its repos,
// and its statuses.
export const projectView = async (ctx: ServiceCtx, tx: Tx, projectId: string): Promise<Project> => {
	const row = await projectRow(tx, projectId);
	const repos = await repoRows(tx, projectId);
	return {
		...toProjectSummary(row),
		description: row.description,
		directory: row.directory,
		ticketTemplate: row.ticket_template,
		ticketCounter: row.ticket_counter,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		repos,
		statuses: ctx.cache.statusesOf(projectId),
	};
};

export const get = async (ctx: ServiceCtx, tx: Tx, input: { project: string }): Promise<Project> => {
	const project = await resolveProject(ctx, tx, input.project);
	return projectView(ctx, tx, project.id);
};
