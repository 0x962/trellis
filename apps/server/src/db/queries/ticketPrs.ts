import {
	CheckBucketSchema,
	type EvidenceKind,
	evidenceFloor,
	prPaths,
	type TicketPr,
	TicketPrSchema,
} from "@trellis/api";
import { type SQL, sql } from "drizzle-orm";
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

export type TicketPrRow = Omit<TicketPr, "kind" | "risk" | "evidence" | "evidenceRequired"> & {
	paths: string[] | null;
	evidenceKinds: EvidenceKind[];
	hasSummary: boolean;
	hasHead: boolean;
};

export const toTicketPrRows = (rows: TicketPrRow[] | null): TicketPr[] =>
	(rows ?? []).map(({ paths, evidenceKinds, hasSummary, hasHead, ...row }) => {
		if (paths === null || paths.length === 0 || row.changedFiles !== paths.length)
			return { ...row, kind: null, risk: null, evidence: null, evidenceRequired: null };
		// Changed-file rows store path and line counts. `prPaths` receives "change", so `risk.deletedTest` remains "no".
		const facts = prPaths(
			row.repo,
			paths.map((path) => ({ path, change: "change" })),
		);
		if (!hasHead) return { ...row, kind: facts.kind, risk: facts.risk, evidence: null, evidenceRequired: null };
		const floor = evidenceFloor({
			kind: facts.kind,
			risk: facts.risk,
			rows: evidenceKinds.map((kind) => ({ kind })),
			hasSummary,
		});
		return {
			...row,
			kind: facts.kind,
			risk: facts.risk,
			evidence: floor.present.length,
			evidenceRequired: floor.required.length,
		};
	});

export const ticketPrColumns = sql`
	ticket_pr.state AS pr_state, ticket_pr.ci_state AS pr_ci_state, ticket_pr.review_state AS pr_review_state,
	ticket_pr.pass AS pr_pass, ticket_pr.fail AS pr_fail, ticket_pr.pending AS pr_pending,
	ticket_pr.reviews AS pr_reviews, ticket_pr.pull_requests AS pr_rows`;

// A flow execution belongs to a ticket. Each pull request row carries the same
// five newest `flowRuns` entries and the same `flowRunCount` total.
const ticketPrJoinFor = (pullRequestCondition: SQL) => sql`
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
					'paths', (
						SELECT jsonb_agg(file.value->>'path' ORDER BY file.position)
						FROM jsonb_array_elements(p.files) WITH ORDINALITY AS file(value, position)
					),
					'sizeBand', CASE
						WHEN p.additions IS NULL OR p.deletions IS NULL THEN NULL
						WHEN p.additions::bigint + p.deletions::bigint < 200 THEN ${SMALL}
						WHEN p.additions::bigint + p.deletions::bigint <= 400 THEN ${MEDIUM}
						ELSE ${LARGE}
					END,
					'evidenceKinds', (
						SELECT COALESCE(jsonb_agg(DISTINCT evidence.kind ORDER BY evidence.kind), '[]'::jsonb)
						FROM pr_evidence evidence
						WHERE evidence.pull_request_id = p.id AND evidence.head_sha = p.head_sha
					),
					'hasSummary', EXISTS (
						SELECT 1 FROM pr_summaries summary
						WHERE summary.pull_request_id = p.id AND summary.head_sha = p.head_sha
					),
					'hasHead', p.head_sha IS NOT NULL,
					'pass', check_counts.pass, 'fail', check_counts.fail,
					'pending', check_counts.pending, 'skipped', check_counts.skipped,
					'failedChecks', check_counts.failed_checks,
					'openThreads', (
						SELECT count(*) FROM review_threads thread
						WHERE thread.pr_id = p.id AND thread.document->>'status' = 'open'
					),
					'flowRuns', flow_runs.items,
					'flowRunCount', flow_runs.total,
					'baseRef', p.base_ref, 'headRef', p.head_ref,
					'stackedOn', (
						SELECT jsonb_build_object(
							'number', stacked.number,
							'headRef', stacked.head_ref,
							'ticketIdentifier', stacked_root.key || '-' || stacked_ticket.number
						)
						FROM ticket_pull_requests stacked_link
						JOIN tickets stacked_ticket ON stacked_ticket.id = stacked_link.ticket_id
						JOIN projects stacked_root ON stacked_root.id = stacked_ticket.root_id
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
				COALESCE(max(recent.total), 0)::int AS total,
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
					) AS findings,
					count(*) OVER () AS total
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
