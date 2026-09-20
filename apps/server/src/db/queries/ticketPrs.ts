import { CheckBucketSchema, TicketPrSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ciRank, prStateRank, reviewStateRank } from "./support.ts";

// `ticketPrJoin` reads links for the caller's ticket alias `t`. It adds the PR badge and `prRows`.
// `pullRequestRows.ts` holds the columns for one standalone pull request.
// A canceled check increases `fail`. A skipped check does not increase a badge total.
// PostgreSQL view definitions cannot hold bound parameters. `schemaLiteral` receives only closed API enum values.
const schemaLiteral = (value: string) => sql.raw(`'${value}'`);

const PASS = schemaLiteral(CheckBucketSchema.enum.pass);
const FAIL = schemaLiteral(CheckBucketSchema.enum.fail);
const PENDING = schemaLiteral(CheckBucketSchema.enum.pending);
const SKIPPED = schemaLiteral(CheckBucketSchema.enum.skipping);
const CANCEL = schemaLiteral(CheckBucketSchema.enum.cancel);

const sizeBands = TicketPrSchema.shape.sizeBand.unwrap().enum;
const SMALL = schemaLiteral(sizeBands.small);
const MEDIUM = schemaLiteral(sizeBands.medium);
const LARGE = schemaLiteral(sizeBands.large);

const passCheck = sql`check_row.value->>'bucket' = ${PASS}`;
const failCheck = sql`check_row.value->>'bucket' IN (${FAIL}, ${CANCEL})`;
const pendingCheck = sql`check_row.value->>'bucket' = ${PENDING}`;
const skippedCheck = sql`check_row.value->>'bucket' = ${SKIPPED}`;

export const ticketPrColumns = sql`
	pr.state AS pr_state, pr.ci_state AS pr_ci_state, pr.review_state AS pr_review_state,
	pr.pass AS pr_pass, pr.fail AS pr_fail, pr.pending AS pr_pending,
	pr.reviews AS pr_reviews, pr.pull_requests AS pr_rows`;

// A flow execution belongs to a ticket. Each pull request row of the ticket
// carries the same `flowRuns` list.
export const ticketPrJoin = sql`
	LEFT JOIN LATERAL (
		SELECT
			(array_agg(p.state ORDER BY ${prStateRank(sql`p.state`)}))[1] AS state,
			(array_agg(p.ci_state ORDER BY ${ciRank(sql`p.ci_state`)}))[1] AS ci_state,
			(array_agg(p.review_state ORDER BY ${reviewStateRank(sql`p.review_state`)}))[1] AS review_state,
			sum(check_counts.pass)::int AS pass,
			sum(check_counts.fail)::int AS fail,
			sum(check_counts.pending)::int AS pending,
			jsonb_agg(
				jsonb_build_object(
					'owner', p.owner, 'repo', p.repo, 'number', p.number,
					'reviewState', p.review_state, 'isDraft', p.is_draft
				) ORDER BY link.created_at, p.id
			) AS reviews,
			jsonb_agg(
				jsonb_build_object(
					'number', p.number, 'owner', p.owner, 'repo', p.repo, 'url', p.url,
					'state', p.state, 'isDraft', p.is_draft,
					'additions', p.additions, 'deletions', p.deletions, 'changedFiles', p.changed_files,
					'sizeBand', CASE
						WHEN p.additions IS NULL OR p.deletions IS NULL THEN NULL
						WHEN p.additions::bigint + p.deletions::bigint < 200 THEN ${SMALL}
						WHEN p.additions::bigint + p.deletions::bigint <= 400 THEN ${MEDIUM}
						ELSE ${LARGE}
					END,
					'pass', check_counts.pass, 'fail', check_counts.fail,
					'pending', check_counts.pending, 'skipped', check_counts.skipped,
					'failedChecks', check_counts.failed_checks,
					'openThreads', (
						SELECT count(*) FROM review_threads thread
						WHERE thread.pr_id = p.id AND thread.document->>'status' = 'open'
					),
					'flowRuns', COALESCE((
						SELECT jsonb_agg(
							jsonb_build_object('state', execution.state->>'status')
							ORDER BY execution.created_at, execution.id
						)
						FROM flow_executions execution WHERE execution.ticket_id = t.id
					), '[]'::jsonb),
					'baseRef', p.base_ref, 'headRef', p.head_ref
				) ORDER BY link.created_at, p.id
			) AS pull_requests
		FROM ticket_pull_requests link
		JOIN pull_requests p ON p.id = link.pull_request_id
		CROSS JOIN LATERAL (
			SELECT
				count(*) FILTER (WHERE ${passCheck})::int AS pass,
				count(*) FILTER (WHERE ${failCheck})::int AS fail,
				count(*) FILTER (WHERE ${pendingCheck})::int AS pending,
				count(*) FILTER (WHERE ${skippedCheck})::int AS skipped,
				COALESCE(
					jsonb_agg(
						jsonb_build_object(
							'name', check_row.value->>'name',
							'workflow', check_row.value->>'workflow'
						) ORDER BY check_row.position
					) FILTER (WHERE ${failCheck}),
					'[]'::jsonb
				) AS failed_checks
			FROM jsonb_array_elements(p.checks) WITH ORDINALITY AS check_row(value, position)
		) check_counts
		WHERE link.ticket_id = t.id
	) pr ON true`;
