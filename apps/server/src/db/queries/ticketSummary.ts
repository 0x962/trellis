import type { CiState, PrState, StoredActorKind, TicketSummary } from "@trellis/api";
import { type SQL, sql } from "drizzle-orm";
import { actorDisplayName } from "./actorDisplayName.ts";
import { ciRank, iso, pathsCte, prStateRank } from "./support.ts";

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
	ancestors: string[] | null;
	child_count: number;
	child_done_count: number;
	comment_count: number;
	attachment_count: number;
	pr_state: PrState | null;
	pr_ci_state: CiState | null;
	pr_pass: number | null;
	pr_fail: number | null;
	pr_pending: number | null;
	pr_reviews: NonNullable<TicketSummary["pr"]>["reviews"] | null;
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

// The check counts behind the PR ribbon come from the `checks` snapshot of
// every linked pull request. A canceled check counts as failed; a skipped
// check counts for nothing.
const bucketCount = (test: SQL) => sql`sum((SELECT count(*) FROM jsonb_array_elements(p.checks) c WHERE ${test}))::int`;

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
	anc.identifiers AS ancestors,
	(SELECT count(*)::int FROM tickets c WHERE c.parent_id = t.id) AS child_count,
	(SELECT count(*)::int FROM tickets c JOIN statuses cs ON cs.id = c.status_id
		WHERE c.parent_id = t.id AND cs.category = 'done') AS child_done_count,
	(SELECT count(*)::int FROM comments c WHERE c.ticket_id = t.id) AS comment_count,
	(SELECT count(*)::int FROM attachments a WHERE a.ticket_id = t.id) AS attachment_count,
	pr.state AS pr_state, pr.ci_state AS pr_ci_state, pr.pass AS pr_pass, pr.fail AS pr_fail, pr.pending AS pr_pending,
	pr.reviews AS pr_reviews,
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
	LEFT JOIN LATERAL (
		SELECT
			(array_agg(p.state ORDER BY ${prStateRank(sql`p.state`)}))[1] AS state,
			(array_agg(p.ci_state ORDER BY ${ciRank(sql`p.ci_state`)}))[1] AS ci_state,
			${bucketCount(sql`c->>'bucket' = 'pass'`)} AS pass,
			${bucketCount(sql`c->>'bucket' IN ('fail', 'cancel')`)} AS fail,
			${bucketCount(sql`c->>'bucket' = 'pending'`)} AS pending,
			jsonb_agg(
				jsonb_build_object(
					'owner', p.owner,
					'repo', p.repo,
					'number', p.number,
					'reviewState', p.review_state,
					'isDraft', p.is_draft
				)
				ORDER BY l.created_at, p.id
			) AS reviews
		FROM ticket_pull_requests l JOIN pull_requests p ON p.id = l.pull_request_id
		WHERE l.ticket_id = t.id
	) pr ON true
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
	childCount: row.child_count,
	childDoneCount: row.child_done_count,
	commentCount: row.comment_count,
	attachmentCount: row.attachment_count,
	pr:
		row.pr_state === null
			? null
			: {
					state: row.pr_state,
					ciState: row.pr_ci_state as CiState,
					pass: row.pr_pass as number,
					fail: row.pr_fail as number,
					pending: row.pr_pending as number,
					reviews: row.pr_reviews as NonNullable<TicketSummary["pr"]>["reviews"],
				},
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
