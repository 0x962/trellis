import {
	type Priority,
	ProjectRefSchema,
	type Status,
	StatusRefSchema,
	type StatusSummary,
	TicketRefSchema,
} from "@trellis/api";
import { sql } from "drizzle-orm";
import type { Ctx } from "../context.ts";
import { effectiveStatuses } from "../db/queries/effectiveStatuses.ts";
import { iso, pathsCte, rows } from "../db/queries/support.ts";
import type { Tx } from "../db/tx.ts";
import { contractError } from "./errors.ts";

// A ref is what a client types: a ULID, `CDE-1`, `CDE.web.auth`, or a status
// name, slug, or `category:x`. Every grammar ignores letter case, and every
// NOT_FOUND carries the canonical spelling of the ref.

// The ticket columns a service reads before it writes. The timestamps stay
// in the database: a service sets them in SQL and compares nothing against
// them. `project_archived` is the flag every mutation checks first.
export type TicketRow = {
	id: string;
	project_id: string;
	root_id: string;
	key: string;
	identifier: string;
	number: number;
	title: string;
	description: string;
	priority: Priority;
	status_id: string;
	parent_id: string | null;
	parent_identifier: string | null;
	position: number;
	version: number;
	project_path: string;
	project_archived: boolean;
};

const ticketSelect = sql`SELECT t.id, t.project_id, t.root_id, root.key, root.key || '-' || t.number AS identifier,
		t.number, t.title, t.description, t.priority, t.status_id, t.parent_id,
		CASE WHEN par.id IS NULL THEN NULL ELSE root.key || '-' || par.number END AS parent_identifier,
		t.position, t.version, paths.path AS project_path, p.archived_at IS NOT NULL AS project_archived
	FROM tickets t
	JOIN projects root ON root.id = t.root_id
	JOIN projects p ON p.id = t.project_id
	JOIN paths ON paths.id = t.project_id
	LEFT JOIN tickets par ON par.id = t.parent_id`;

export const resolveTicket = async (_ctx: Ctx, tx: Tx, ref: string): Promise<TicketRow> => {
	const parsed = TicketRefSchema.parse(ref);
	const where =
		parsed.kind === "ulid" ? sql`t.id = ${parsed.id}` : sql`root.key = ${parsed.key} AND t.number = ${parsed.number}`;
	const found = await rows<TicketRow>(tx, sql`WITH RECURSIVE ${pathsCte} ${ticketSelect} WHERE ${where}`);
	if (found.length === 0) {
		throw contractError("NOT_FOUND", { kind: "ticket", ref: TicketRefSchema.canonicalize(ref) });
	}
	return found[0] as TicketRow;
};

// `key` is the root's key for every project of the tree. `path` is the
// canonical project ref, `CDE.web.auth`.
export type ProjectRow = {
	id: string;
	parentId: string | null;
	rootId: string;
	key: string;
	slug: string;
	name: string;
	path: string;
	ticketTemplate: string;
	archivedAt: string | null;
};

type RawProject = {
	id: string;
	parent_id: string | null;
	root_id: string;
	key: string;
	slug: string;
	name: string;
	path: string;
	ticket_template: string;
	archived_at: string | null;
};

export const resolveProject = async (_ctx: Ctx, tx: Tx, ref: string): Promise<ProjectRow> => {
	const parsed = ProjectRefSchema.parse(ref);
	const canonical = ProjectRefSchema.canonicalize(ref);
	const where = parsed.kind === "ulid" ? sql`p.id = ${parsed.id}` : sql`paths.path = ${canonical}`;
	const found = await rows<RawProject>(
		tx,
		sql`WITH RECURSIVE ${pathsCte}
			SELECT p.id, p.parent_id, p.root_id, root.key, p.slug, p.name, paths.path, p.ticket_template,
				${iso(sql`p.archived_at`)} AS archived_at
			FROM projects p JOIN projects root ON root.id = p.root_id JOIN paths ON paths.id = p.id
			WHERE ${where}`,
	);
	if (found.length === 0) throw contractError("NOT_FOUND", { kind: "project", ref: canonical });
	const row = found[0] as RawProject;
	return {
		id: row.id,
		parentId: row.parent_id,
		rootId: row.root_id,
		key: row.key,
		slug: row.slug,
		name: row.name,
		path: row.path,
		ticketTemplate: row.ticket_template,
		archivedAt: row.archived_at,
	};
};

export const toStatusSummary = (status: Status): StatusSummary => ({
	id: status.id,
	slug: status.slug,
	name: status.name,
	category: status.category,
	reviewer: status.reviewer,
	color: status.color,
});

// A status resolves inside the effective set of its project, the owner's
// set, in position order: `category:x` is the lowest status of that
// category. A ref outside the set is STATUS_NOT_IN_PROJECT with the set.
export const resolveStatus = async (
	_ctx: Ctx,
	tx: Tx,
	input: { projectId: string; status: string },
): Promise<Status> => {
	const statuses = await effectiveStatuses(tx, input.projectId);
	const parsed = StatusRefSchema.parse(input.status);
	const value = parsed.kind === "identifier" ? parsed.value.toLowerCase() : null;
	const found = statuses.find((status) => {
		if (parsed.kind === "ulid") return status.id === parsed.id;
		if (parsed.kind === "category") return status.category === parsed.category;
		return status.slug === value || status.name.toLowerCase() === value;
	});
	if (found === undefined) throw contractError("STATUS_NOT_IN_PROJECT", { valid: statuses.map(toStatusSummary) });
	return found;
};
