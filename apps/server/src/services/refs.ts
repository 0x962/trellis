import {
	type Priority,
	ProjectRefSchema,
	type Status,
	StatusRefSchema,
	type StatusSummary,
	TicketRefSchema,
} from "@trellis/api";
import { sql } from "drizzle-orm";
import { requireActor, type ServiceCtx } from "../context.ts";
import type { CachedProject, ProjectCache } from "../db/cache.ts";
import { iso, rows } from "../db/queries/support.ts";
import type { Tx } from "../db/tx.ts";
import { fail } from "../errors.ts";

// A ref is what a client types for a row: a ULID, `CDE-1`, `CDE.web.auth`,
// or a status name, slug, or `category:x`. Every grammar ignores letter
// case. A project resolves through the cache and runs no query. A status
// resolves inside the effective set of its project, which is the owner's set.

// One ticket row with the column names of the wire. Timestamps are ISO strings.
export type TicketRow = {
	id: string;
	projectId: string;
	rootId: string;
	number: number;
	identifier: string;
	title: string;
	description: string;
	priority: Priority;
	statusId: string;
	parentId: string | null;
	parentIdentifier: string | null;
	epicId: string | null;
	epicRef: string | null;
	waveId: string | null;
	waveRef: string | null;
	position: number;
	version: number;
	startedAt: string | null;
	completedAt: string | null;
	createdAt: string;
	updatedAt: string;
};

const ticketColumns = sql`t.id, t.project_id AS "projectId", t.root_id AS "rootId", t.number,
	root.key || '-' || t.number AS identifier, t.title, t.description,
	t.priority, t.status_id AS "statusId", t.parent_id AS "parentId",
	CASE WHEN par.id IS NULL THEN NULL ELSE root.key || '-' || par.number END AS "parentIdentifier",
	t.epic_id AS "epicId",
	CASE WHEN e.id IS NULL THEN NULL ELSE root.key || '/' || e.slug END AS "epicRef",
	t.wave_id AS "waveId",
	CASE WHEN m.id IS NULL THEN NULL ELSE root.key || '/' || e.slug || '/' || m.slug END AS "waveRef",
	t.position, t.version,
	${iso(sql`t.started_at`)} AS "startedAt", ${iso(sql`t.completed_at`)} AS "completedAt",
	${iso(sql`t.created_at`)} AS "createdAt", ${iso(sql`t.updated_at`)} AS "updatedAt"`;

export const resolveTicket = async (_ctx: ServiceCtx, tx: Tx, ref: string): Promise<TicketRow> => {
	const parsed = TicketRefSchema.safeParse(ref);
	if (!parsed.success) throw fail("NOT_FOUND", { kind: "ticket", ref });
	const canonical = TicketRefSchema.canonicalize(ref);
	const where =
		parsed.data.kind === "ulid"
			? sql`t.id = ${parsed.data.id}`
			: sql`root.key = ${parsed.data.key} AND t.number = ${parsed.data.number}`;
	const found = await rows<TicketRow>(
		tx,
		sql`SELECT ${ticketColumns} FROM tickets t
			JOIN projects root ON root.id = t.root_id
			LEFT JOIN tickets par ON par.id = t.parent_id
			LEFT JOIN epics e ON e.id = t.epic_id
			LEFT JOIN waves m ON m.id = t.wave_id
			WHERE ${where}`,
	);
	if (found.length === 0) throw fail("NOT_FOUND", { kind: "ticket", ref: canonical });
	return found[0]!;
};

// Answers from the cache, so a request resolves a path without a statement.
export const resolveProject = async (ctx: ServiceCtx, _tx: Tx, ref: string): Promise<CachedProject> => {
	const parsed = ProjectRefSchema.safeParse(ref);
	if (!parsed.success) throw fail("NOT_FOUND", { kind: "project", ref });
	const canonical = ProjectRefSchema.canonicalize(ref);
	const id = parsed.data.kind === "ulid" ? parsed.data.id : ctx.cache.resolvePath(canonical);
	const project = id === null ? undefined : (ctx.cache.get(id) as CachedProject | undefined);
	if (project === undefined) throw fail("NOT_FOUND", { kind: "project", ref: canonical });
	return project;
};

export const toSummary = (status: Status): StatusSummary => ({
	id: status.id,
	slug: status.slug,
	name: status.name,
	category: status.category,
	reviewer: status.reviewer,
	color: status.color,
});

export type ResolveStatusInput = { projectId: string; status: string };

// `category:x` picks the lowest-position status of that category. The
// effective set is in position order, so the first match is the answer.
export const resolveStatus = async (ctx: ServiceCtx, _tx: Tx, input: ResolveStatusInput): Promise<Status> => {
	const { statuses } = ctx.cache.effectiveStatuses(input.projectId);
	const notInProject = () => fail("STATUS_NOT_IN_PROJECT", { valid: statuses.map(toSummary) });
	const parsed = StatusRefSchema.safeParse(input.status);
	if (!parsed.success) throw notInProject();
	const ref = parsed.data;
	const found = statuses.find((status) => {
		if (ref.kind === "ulid") return status.id === ref.id;
		if (ref.kind === "category") return status.category === ref.category;
		const value = ref.value.toLowerCase();
		return status.slug === value || status.name.toLowerCase() === value;
	});
	if (found === undefined) throw notInProject();
	return found;
};

// The project and every ancestor, nearest first.
export const chainOf = (cache: ProjectCache, projectId: string): CachedProject[] => {
	const chain: CachedProject[] = [];
	let current: CachedProject | undefined = cache.get(projectId);
	while (current !== undefined) {
		chain.push(current);
		current = current.parentId === null ? undefined : cache.get(current.parentId);
	}
	return chain;
};

// The canonical ref of a project: the root key, then one slug per level.
export const pathOf = (cache: ProjectCache, projectId: string) => {
	const chain = chainOf(cache, projectId).reverse();
	return chain.map((project, index) => (index === 0 ? (project.key as string) : project.slug)).join(".");
};

// An archived project, or one below an archived ancestor, accepts no
// mutation. Reads still answer.
export const assertProjectActive = (ctx: ServiceCtx, projectId: string) => {
	if (chainOf(ctx.cache, projectId).some((project) => project.archivedAt !== null)) throw fail("PROJECT_ARCHIVED");
};

// The three checks every project mutation starts with. An actor is present.
// The ref names a project. Nothing at or above that project is archived.
export const resolveMutableProject = async (ctx: ServiceCtx, tx: Tx, ref: string) => {
	requireActor(ctx);
	const project = await resolveProject(ctx, tx, ref);
	assertProjectActive(ctx, project.id);
	return project;
};
