import { CheckBucketSchema, type TicketPr, TicketPrSchema, type VerdictFacts, verdictMark } from "@trellis/api";
import { type SQL, sql } from "drizzle-orm";
import { localReviewState, submissionByPerson, submissionHeadSha } from "./pullRequestRows.ts";
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
const verdictState = localReviewState(sql`p.id`);

export type TicketPrRow = Omit<TicketPr, "verdict"> & {
	submissions: VerdictFacts[];
};

export const toTicketPrRows = (rows: TicketPrRow[] | null): TicketPr[] =>
	(rows ?? []).map(({ submissions, ...fields }) => ({ ...fields, verdict: verdictMark(submissions) }));

export const ticketPrColumns = sql`
	ticket_pr.state AS pr_state, ticket_pr.is_draft AS pr_is_draft, ticket_pr.is_queued AS pr_is_queued,
	ticket_pr.local_state AS pr_local_state,
	ticket_pr.ci_state AS pr_ci_state, ticket_pr.review_state AS pr_review_state,
	ticket_pr.pass AS pr_pass, ticket_pr.fail AS pr_fail, ticket_pr.pending AS pr_pending,
	ticket_pr.reviews AS pr_reviews, ticket_pr.pull_requests AS pr_rows`;

// A flow execution belongs to a ticket. Each pull request row carries the same
// five newest `flowRuns` entries.
const ticketPrJoinFor = (pullRequestCondition: SQL) => sql`
	LEFT JOIN LATERAL (
		SELECT
			(array_agg(p.state ORDER BY ${prStateRank(sql`p.state`)}))[1] AS state,
			bool_or(p.is_draft) AS is_draft,
			bool_or(p.is_queued) AS is_queued,
			CASE WHEN bool_or(p.local_state = 'draft') THEN 'draft' ELSE 'ready' END AS local_state,
			(array_agg(p.ci_state ORDER BY ${ciRank(sql`p.ci_state`)}))[1] AS ci_state,
			(array_agg(${verdictState} ORDER BY ${reviewStateRank(verdictState)}))[1] AS review_state,
			sum(check_counts.pass)::int AS pass,
			sum(check_counts.fail)::int AS fail,
			sum(check_counts.pending)::int AS pending,
			jsonb_agg(
				jsonb_build_object(
					'owner', p.owner, 'repo', p.repo, 'number', p.number,
					'reviewState', ${verdictState}, 'isDraft', p.local_state = 'draft', 'localState', p.local_state
				) ORDER BY link.created_at, p.id
			) AS reviews,
			jsonb_agg(
				jsonb_build_object(
					'id', p.id, 'number', p.number, 'owner', p.owner, 'repo', p.repo, 'url', p.url, 'title', p.title,
					'state', p.state, 'isDraft', p.is_draft, 'isQueued', p.is_queued, 'localState', p.local_state,
					'additions', p.additions, 'deletions', p.deletions, 'changedFiles', p.changed_files,
					'sizeBand', CASE
						WHEN p.additions IS NULL OR p.deletions IS NULL THEN NULL
						WHEN p.additions::bigint + p.deletions::bigint < 200 THEN ${SMALL}
						WHEN p.additions::bigint + p.deletions::bigint <= 400 THEN ${MEDIUM}
						ELSE ${LARGE}
					END,
					'submissions', (
						SELECT COALESCE(jsonb_agg(jsonb_build_object(
							'verdict', submission.document->>'verdict',
							'headSha', ${submissionHeadSha(sql`submission`)},
							'byPerson', ${submissionByPerson(sql`submission`)},
							'createdAt', submission.document->>'createdAt'
						)), '[]'::jsonb)
						FROM review_submissions submission
						WHERE submission.pr_id = p.id
					),
					'pass', check_counts.pass, 'fail', check_counts.fail,
					'pending', check_counts.pending, 'skipped', check_counts.skipped,
					'failedChecks', check_counts.failed_checks,
					'openThreads', (
						SELECT count(*) FROM review_threads thread
						WHERE thread.pr_id = p.id AND thread.document->>'status' = 'open'
					),
					'flowRuns', flow_runs.items,
					'baseRef', p.base_ref, 'headRef', p.head_ref, 'mergeable', p.mergeable,
					'stackedOn', (
						SELECT jsonb_build_object(
							'number', stacked.number,
							'headRef', stacked.head_ref,
							'ticketIdentifier', stacked_project.key || '-' || stacked_ticket.number
						)
						FROM ticket_pull_requests stacked_link
						JOIN tickets stacked_ticket ON stacked_ticket.id = stacked_link.ticket_id
						JOIN projects stacked_project ON stacked_project.id = stacked_ticket.project_id
						JOIN pull_requests stacked ON stacked.id = stacked_link.pull_request_id
						WHERE t.epic_id IS NOT NULL
							AND stacked_ticket.epic_id = t.epic_id
							AND stacked.id <> p.id
							AND stacked.head_ref = p.base_ref
						ORDER BY stacked_ticket.number, stacked.number, stacked.id
						LIMIT 1
					)
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
		CROSS JOIN LATERAL (
			SELECT
				COALESCE(
					jsonb_agg(
						jsonb_build_object(
							'name', recent.name,
							'status', recent.status,
							'findings', recent.findings
						)
						ORDER BY recent.created_at DESC, recent.id DESC
					),
					'[]'::jsonb
				) AS items
			FROM (
				SELECT
					execution.id,
					execution.created_at,
					execution.doc->'flow'->>'name' AS name,
					execution.state->>'status' AS status,
					(
						-- --author can replace the actor name of a review thread. Its session
						-- still matches agent_runs.session_id. One execution can use the same
						-- run for two task keys, so count each thread one time.
						SELECT count(DISTINCT thread.id)::int
						FROM flow_execution_tasks task
						JOIN agent_runs run ON run.id = task.run_id
						JOIN review_threads thread
							ON thread.pr_id = p.id
							AND thread.document->>'session' = run.session_id
						WHERE task.execution_id = execution.id
					) AS findings
				FROM flow_executions execution
				WHERE execution.ticket_id = t.id
				ORDER BY execution.created_at DESC, execution.id DESC
				LIMIT 5
			) recent
		) flow_runs
		WHERE link.ticket_id = t.id AND ${pullRequestCondition}
	) ticket_pr ON true`;

export const ticketPrJoin = ticketPrJoinFor(sql`true`);
export const requestedTicketPrJoin = ticketPrJoinFor(sql`p.id = t.requested_pr_id`);
