import { type SQL, sql } from "drizzle-orm";
import { ciRank, prStateRank, reviewStateRank } from "./support.ts";

// `bucketCount` folds the last GitHub check snapshot into the PR badge totals.
// A canceled check increases `fail`. A skipped check does not increase a badge total.
const bucketCount = (test: SQL) => sql`sum((SELECT count(*) FROM jsonb_array_elements(p.checks) c WHERE ${test}))::int`;

export const ticketPrColumns = sql`
	pr.state AS pr_state, pr.ci_state AS pr_ci_state, pr.review_state AS pr_review_state,
	pr.pass AS pr_pass, pr.fail AS pr_fail, pr.pending AS pr_pending,
	pr.reviews AS pr_reviews, pr.rows AS pr_rows`;

// A flow execution belongs to a ticket. Each pull request row of the ticket
// carries the same `flowRuns` list.
export const ticketPrJoin = sql`
	LEFT JOIN LATERAL (
		WITH flow_runs AS (
			SELECT COALESCE(
				jsonb_agg(jsonb_build_object('state', f.state->>'status') ORDER BY f.created_at, f.id),
				'[]'::jsonb
			) AS items
			FROM flow_executions f WHERE f.ticket_id = t.id
		)
		SELECT
			(array_agg(p.state ORDER BY ${prStateRank(sql`p.state`)}))[1] AS state,
			(array_agg(p.ci_state ORDER BY ${ciRank(sql`p.ci_state`)}))[1] AS ci_state,
			(array_agg(p.review_state ORDER BY ${reviewStateRank(sql`p.review_state`)}))[1] AS review_state,
			${bucketCount(sql`c->>'bucket' = 'pass'`)} AS pass,
			${bucketCount(sql`c->>'bucket' IN ('fail', 'cancel')`)} AS fail,
			${bucketCount(sql`c->>'bucket' = 'pending'`)} AS pending,
			jsonb_agg(
				jsonb_build_object(
					'owner', p.owner, 'repo', p.repo, 'number', p.number,
					'reviewState', p.review_state, 'isDraft', p.is_draft
				) ORDER BY l.created_at, p.id
			) AS reviews,
			jsonb_agg(
				jsonb_build_object(
					'number', p.number, 'owner', p.owner, 'repo', p.repo, 'url', p.url,
					'state', p.state, 'isDraft', p.is_draft,
					'additions', p.additions, 'deletions', p.deletions, 'changedFiles', p.changed_files,
					'sizeBand', CASE
						WHEN p.additions IS NULL OR p.deletions IS NULL THEN NULL
						WHEN p.additions::bigint + p.deletions::bigint < 200 THEN 'small'
						WHEN p.additions::bigint + p.deletions::bigint <= 400 THEN 'medium'
						ELSE 'large'
					END,
					'pass', (SELECT count(*) FROM jsonb_array_elements(p.checks) c WHERE c->>'bucket' = 'pass'),
					'fail', (SELECT count(*) FROM jsonb_array_elements(p.checks) c WHERE c->>'bucket' IN ('fail', 'cancel')),
					'pending', (SELECT count(*) FROM jsonb_array_elements(p.checks) c WHERE c->>'bucket' = 'pending'),
					'skipped', (SELECT count(*) FROM jsonb_array_elements(p.checks) c WHERE c->>'bucket' = 'skipping'),
					'failedChecks', COALESCE((
						SELECT jsonb_agg(jsonb_build_object('name', c->>'name', 'workflow', c->>'workflow') ORDER BY ord)
						FROM jsonb_array_elements(p.checks) WITH ORDINALITY checks(c, ord)
						WHERE c->>'bucket' IN ('fail', 'cancel')
					), '[]'::jsonb),
					'openThreads', (SELECT count(*) FROM review_threads r WHERE r.pr_id = p.id AND r.document->>'status' = 'open'),
					'flowRuns', flow_runs.items, 'baseRef', p.base_ref, 'headRef', p.head_ref
				) ORDER BY l.created_at, p.id
			) AS rows
		FROM ticket_pull_requests l
		JOIN pull_requests p ON p.id = l.pull_request_id
		CROSS JOIN flow_runs
		WHERE l.ticket_id = t.id
	) pr ON true`;
