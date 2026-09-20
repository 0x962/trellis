import type { CiState, PrState, ReviewState, StoredActorKind, TicketSummary } from "@trellis/api";
import { type SQL, sql } from "drizzle-orm";
import { actorDisplayName } from "./actorDisplayName.ts";
import { iso, pathsCte } from "./support.ts";
import { ticketPrColumns, ticketPrJoin } from "./ticketPrs.ts";

export type SummaryRow = {
	id: string;
	identifier: string;
	number: number;
	title: string;
	priority: TicketSummary["priority"];
	status_id: string;
	status_slug: string;
	status_name: string;
	status_category: TicketSummary["status"]["category"];
	status_reviewer: TicketSummary["status"]["reviewer"];
	status_color: TicketSummary["status"]["color"];
	project_id: string;
	project_key: string;
	project_path: string;
	parent_id: string | null;
	parent_identifier: string | null;
	epic_id: string | null;
	epic_slug: string | null;
	epic_name: string | null;
	milestone_id: string | null;
	milestone_slug: string | null;
	milestone_name: string | null;
	ancestors: string[] | null;
	child_count: number;
	child_done_count: number;
	comment_count: number;
	attachment_count: number;
	labels: TicketSummary["labels"] | null;
	pr_state: PrState | null;
	pr_ci_state: CiState | null;
	pr_review_state: ReviewState | null;
	pr_pass: number | null;
	pr_fail: number | null;
	pr_pending: number | null;
	pr_reviews: NonNullable<TicketSummary["pr"]>["reviews"] | null;
	pr_rows: TicketSummary["prRows"] | null;
	last_actor_name: string | null;
	last_actor_display_name: string | null;
	last_actor_kind: StoredActorKind | null;
	last_actor_at: string | null;
	position: number;
	version: number;
	created_at: string;
	updated_at: string;
	completed_at: string | null;
};

// One row of TicketSummary per ticket in `page`, an earlier CTE with the
// columns `id` and `rn`. Every count and the PR badge are subqueries on the
// page rows only, so a page of 50 never touches the counts of the rest.
export const summaryColumns = sql`
	t.id,
	root.key || '-' || t.number AS identifier,
	t.number, t.title, t.priority,
	s.id AS status_id, s.slug AS status_slug, s.name AS status_name,
	s.category AS status_category, s.reviewer AS status_reviewer, s.color AS status_color,
	t.project_id, root.key AS project_key, pp.path AS project_path,
	par.id AS parent_id,
	CASE WHEN par.id IS NULL THEN NULL ELSE root.key || '-' || par.number END AS parent_identifier,
	e.id AS epic_id, e.slug AS epic_slug, e.name AS epic_name,
	m.id AS milestone_id, m.slug AS milestone_slug, m.name AS milestone_name,
	anc.identifiers AS ancestors,
	(SELECT count(*)::int FROM tickets c WHERE c.parent_id = t.id) AS child_count,
	(SELECT count(*)::int FROM tickets c JOIN statuses cs ON cs.id = c.status_id
		WHERE c.parent_id = t.id AND cs.category = 'done') AS child_done_count,
	(SELECT count(*)::int FROM comments c WHERE c.ticket_id = t.id) AS comment_count,
	(SELECT count(*)::int FROM attachments a WHERE a.ticket_id = t.id) AS attachment_count,
	lb.items AS labels,
	${ticketPrColumns},
	${actorDisplayName(sql`la.actor_name`, sql`la.actor_kind`)} AS last_actor_display_name,
	la.actor_name AS last_actor_name, la.actor_kind AS last_actor_kind, ${iso(sql`la.created_at`)} AS last_actor_at,
	t.position, t.version,
	${iso(sql`t.created_at`)} AS created_at,
	${iso(sql`t.updated_at`)} AS updated_at,
	${iso(sql`t.completed_at`)} AS completed_at`;

export const summaryJoins = sql`
	FROM page
	JOIN tickets t ON t.id = page.id
	JOIN statuses s ON s.id = t.status_id
	JOIN projects root ON root.id = t.root_id
	JOIN paths pp ON pp.id = t.project_id
	LEFT JOIN tickets par ON par.id = t.parent_id
	LEFT JOIN epics e ON e.id = t.epic_id
	LEFT JOIN milestones m ON m.id = t.milestone_id
	LEFT JOIN LATERAL (
		SELECT jsonb_agg(
			jsonb_build_object('id', l.id, 'name', l.name, 'color', l.color, 'group', g.name)
			ORDER BY (l.group_id IS NOT NULL), lower(g.name), lower(l.name)
		) AS items
		FROM ticket_labels tl
		JOIN labels l ON l.id = tl.label_id
		LEFT JOIN label_groups g ON g.id = l.group_id
		WHERE tl.ticket_id = t.id
	) lb ON true
	${ticketPrJoin}
	LEFT JOIN LATERAL (
		WITH RECURSIVE chain AS (
			SELECT a.id, a.parent_id, a.number, 1 AS depth FROM tickets a WHERE a.id = t.parent_id
			UNION ALL
			SELECT a.id, a.parent_id, a.number, chain.depth + 1
			FROM tickets a JOIN chain ON a.id = chain.parent_id
		)
		SELECT array_agg(root.key || '-' || chain.number ORDER BY chain.depth DESC) AS identifiers FROM chain
	) anc ON true
	LEFT JOIN LATERAL (
		SELECT a.actor_name, a.actor_kind, a.created_at FROM activity a
		WHERE a.ticket_id = t.id ORDER BY a.created_at DESC, a.id DESC LIMIT 1
	) la ON true`;

// A whole statement: `cte` defines `page`, and `extra` adds columns of the
// page (a window total, a sort key) to every summary row.
export const summaryStatement = (cte: SQL, extra: SQL, orderBy: SQL) =>
	sql`WITH RECURSIVE ${pathsCte}, ${cte} SELECT ${summaryColumns} ${extra} ${summaryJoins} ORDER BY ${orderBy}`;

export const toSummary = (row: SummaryRow): TicketSummary => ({
	id: row.id,
	identifier: row.identifier,
	number: row.number,
	title: row.title,
	priority: row.priority,
	status: {
		id: row.status_id,
		slug: row.status_slug,
		name: row.status_name,
		category: row.status_category,
		reviewer: row.status_reviewer,
		color: row.status_color,
	},
	project: { id: row.project_id, key: row.project_key, path: row.project_path },
	parent: row.parent_id === null ? null : { id: row.parent_id, identifier: row.parent_identifier as string },
	ancestors: row.ancestors ?? [],
	epic:
		row.epic_id === null
			? null
			: { id: row.epic_id, ref: `${row.project_key}/${row.epic_slug}`, name: row.epic_name as string },
	// The milestone of a ticket is a milestone of the epic of that ticket, so
	// the epic slug of the row is the middle segment of the milestone ref.
	milestone:
		row.milestone_id === null
			? null
			: {
					id: row.milestone_id,
					ref: `${row.project_key}/${row.epic_slug}/${row.milestone_slug}`,
					name: row.milestone_name as string,
				},
	childCount: row.child_count,
	childDoneCount: row.child_done_count,
	commentCount: row.comment_count,
	attachmentCount: row.attachment_count,
	labels: row.labels ?? [],
	pr:
		row.pr_state === null
			? null
			: {
					state: row.pr_state,
					ciState: row.pr_ci_state as CiState,
					reviewState: row.pr_review_state as ReviewState,
					pass: row.pr_pass as number,
					fail: row.pr_fail as number,
					pending: row.pr_pending as number,
					reviews: row.pr_reviews as NonNullable<TicketSummary["pr"]>["reviews"],
				},
	prRows: row.pr_rows ?? [],
	lastActor:
		row.last_actor_name === null
			? null
			: {
					name: row.last_actor_name,
					...(row.last_actor_display_name === null ? {} : { displayName: row.last_actor_display_name }),
					kind: row.last_actor_kind as StoredActorKind,
					at: row.last_actor_at as string,
				},
	position: row.position,
	version: row.version,
	createdAt: row.created_at,
	updatedAt: row.updated_at,
	completedAt: row.completed_at,
});
