import type { ProjectSummary } from "@trellis/api";
import { sql } from "drizzle-orm";
import { iso, pathsCte } from "./support.ts";

export type ProjectSummaryRow = {
	id: string;
	parent_id: string | null;
	root_id: string;
	key: string;
	slug: string;
	path: string;
	name: string;
	depth: number;
	position: number;
	open_count: number;
	archived_at: string | null;
};

// Every (ancestor, descendant) pair, a project paired with itself included,
// so a count over a subtree is one join. The tree has no maximum depth; the
// CYCLE clause ends the walk when a planted parent cycle repeats a project.
const closureCte = sql`closure AS (
	SELECT id AS anc, id AS des, 0 AS depth FROM projects
	UNION ALL
	SELECT closure.anc, p.id, closure.depth + 1
	FROM projects p JOIN closure ON p.parent_id = closure.des
) CYCLE des SET is_cycle USING cycle_path`;

export const projectCtes = sql`${pathsCte}, ${closureCte}`;

// The columns of ProjectSummary for the alias `p`. `openCount` is the open
// tickets of the subtree.
export const projectSummaryColumns = sql`
	p.id, p.parent_id, p.root_id, root.key, p.slug, pp.path, p.name, pp.depth, p.position,
	(SELECT count(*)::int FROM tickets t JOIN closure c ON c.des = t.project_id
		WHERE c.anc = p.id AND t.completed_at IS NULL) AS open_count,
	${iso(sql`p.archived_at`)} AS archived_at`;

export const projectSummaryJoins = sql`
	FROM projects p
	JOIN projects root ON root.id = p.root_id
	JOIN paths pp ON pp.id = p.id`;

export const toProjectSummary = (row: ProjectSummaryRow): ProjectSummary => ({
	id: row.id,
	parentId: row.parent_id,
	rootId: row.root_id,
	key: row.key,
	slug: row.slug,
	path: row.path,
	name: row.name,
	depth: row.depth,
	position: row.position,
	openCount: row.open_count,
	archivedAt: row.archived_at,
});
