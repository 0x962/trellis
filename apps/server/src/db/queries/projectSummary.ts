import type { ProjectSummary } from "@trellis/api";
import { sql } from "drizzle-orm";
import { iso } from "./support.ts";

export type ProjectSummaryRow = {
	id: string;
	key: string;
	slug: string;
	name: string;
	position: number;
	open_count: number;
	open_epic_count: number;
	archived_at: string | null;
};

// The columns of ProjectSummary for the alias `p`. `openCount` counts the
// open tickets of `p`. `openEpicCount` counts the epics of `p` whose state
// is open: an epic with no ticket, or with one ticket at least whose status
// is not done and not canceled.
export const projectSummaryColumns = sql`
	p.id, p.key, p.slug, p.name, p.position,
	(SELECT count(*)::int FROM tickets t
		WHERE t.project_id = p.id AND t.completed_at IS NULL) AS open_count,
	(SELECT count(*)::int FROM epics e
		WHERE e.project_id = p.id AND (
			NOT EXISTS (SELECT 1 FROM tickets t WHERE t.epic_id = e.id)
			OR EXISTS (SELECT 1 FROM tickets t JOIN statuses s ON s.id = t.status_id
				WHERE t.epic_id = e.id AND s.category NOT IN ('done', 'canceled'))
		)) AS open_epic_count,
	${iso(sql`p.archived_at`)} AS archived_at`;

export const projectSummaryJoins = sql`FROM projects p`;

export const toProjectSummary = (row: ProjectSummaryRow): ProjectSummary => ({
	id: row.id,
	key: row.key,
	slug: row.slug,
	name: row.name,
	position: row.position,
	openCount: row.open_count,
	openEpicCount: row.open_epic_count,
	archivedAt: row.archived_at,
});
