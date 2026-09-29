import type { Check, LocalPrState, Mergeable, PrState, ReviewReadyFacts } from "@trellis/api";
import { type SQL, sql } from "drizzle-orm";
import { flowAppliesToProject } from "./flowScope.ts";

// The V1 projector validates native results and human receipts before it stores a successful status.
// Both engines retain their original agent runs so review comments keep their session attribution.
export const flowReviewExecutionsSql = sql`
	SELECT execution.id, execution.flow_id, execution.ticket_id, execution.diff_id,
		execution.head_sha AS reviewed_head, execution.created_at,
		execution.doc->'flow'->>'name' AS name, execution.state->>'status' AS status,
		ARRAY(SELECT task.run_id FROM flow_execution_tasks task WHERE task.execution_id = execution.id) AS agent_run_ids
	FROM flow_executions execution
	UNION ALL
	SELECT execution.execution_id AS id, execution.flow_id, execution.ticket_id, execution.diff_id,
		execution.reviewed_head, execution.created_at,
		projection.view->'snapshot'->'flow'->>'name' AS name, projection.view->>'status' AS status,
		ARRAY(
			SELECT DISTINCT attempt->>'agentRunId'
			FROM jsonb_array_elements(projection.view->'occurrences') occurrence
			CROSS JOIN LATERAL jsonb_array_elements(occurrence->'attempts') attempt
		) AS agent_run_ids
	FROM langflow_executions execution
	JOIN langflow_execution_projections projection ON projection.execution_id = execution.execution_id
`;

// The facts that `reviewGaps` in `packages/api` reads, in SQL. `p` is the
// alias of the `pull_requests` row in the caller's query.

// Linked tickets supply the projects whose flows apply to this diff.
const linkedTickets = (p: SQL) => sql`SELECT pr_link.ticket_id
	FROM ticket_pull_requests pr_link WHERE pr_link.pull_request_id = ${p}.id`;

// A flow can belong to one root project or apply to every project.
const someFlowApplies = (p: SQL) => sql`EXISTS (
	SELECT 1 FROM flows flow
	JOIN tickets ticket ON ticket.id IN (${linkedTickets(p)})
	WHERE ${flowAppliesToProject(sql`flow`, sql`ticket.project_id`)}
)`;

// True when the flow check needs no run. One succeeded run answers for the
// whole pull request: a later push keeps that answer, because a flow reviews
// the change, and a second full review of the same change costs the same
// again and tells the person nothing new.
export const flowAnsweredSql = (p: SQL) => sql`(
	NOT ${someFlowApplies(p)}
	OR NOT EXISTS (${linkedTickets(p)})
	OR EXISTS (
		SELECT 1 FROM pr_flow_waivers waiver
		WHERE waiver.pull_request_id = ${p}.id
	)
	OR EXISTS (
		SELECT 1 FROM (${flowReviewExecutionsSql}) execution
		JOIN flows flow ON flow.id = execution.flow_id
		JOIN tickets ticket ON ticket.id IN (${linkedTickets(p)})
		WHERE execution.diff_id = ${p}.id
			AND ${flowAppliesToProject(sql`flow`, sql`ticket.project_id`)}
			AND execution.status = 'succeeded'
	)
)`;

// One saved explanation answers the human overview requirement until the agent updates its meaning.
export const hasExplanationSql = (p: SQL) => sql`EXISTS (
	SELECT 1 FROM pr_summaries summary
	WHERE summary.pull_request_id = ${p}.id
)`;

// One evidence document per pull request, and a new write replaces it. The
// document names the commit it proves, so a push takes it away.
export const hasEvidenceSql = (p: SQL) => sql`EXISTS (
	SELECT 1 FROM pr_evidence_documents document
	WHERE document.pull_request_id = ${p}.id AND document.head_sha = ${p}.head_sha
)`;

export const openFindingsSql = (p: SQL) => sql`(
	SELECT count(*) FROM review_threads thread
	WHERE thread.pr_id = ${p}.id AND thread.document->>'status' = 'open'
)`;

// The SQL form of `reviewGaps` in `packages/api`: true when that function
// answers with at least one missing part. `ci_state` is `fail` when a check
// failed or was canceled and `pending` while one still runs, which is the
// pair of check gaps.
export const notReadyForReviewSql = (p: SQL) => sql`(
	${p}.state = 'open' AND (
		${p}.local_state <> 'ready'
		OR NOT ${hasExplanationSql(p)}
		OR NOT ${hasEvidenceSql(p)}
		OR NOT ${flowAnsweredSql(p)}
		OR ${p}.ci_state IN ('fail', 'pending')
		OR ${openFindingsSql(p)} > 0
		OR ${p}.mergeable = 'conflicting'
	)
)`;

// The stored fields a row carries, whatever query read it. Every caller that
// turns a row into `ReviewReadyFacts` reads the same names, so a new fact is
// added here and in `reviewGaps`, not in each query.
export type ReviewReadyRow = {
	state: PrState;
	localState: LocalPrState;
	checks: Check[];
	openFindings: number;
	hasExplanation: boolean;
	hasEvidence: boolean;
	flowAnswered: boolean;
	mergeable: Mergeable;
};

// A canceled check counts as a failed one, the way `ciState` folds it.
export const reviewReadyFacts = (row: ReviewReadyRow): ReviewReadyFacts => ({
	state: row.state,
	localState: row.localState,
	failedChecks: row.checks.filter((check) => check.bucket === "fail" || check.bucket === "cancel").length,
	pendingChecks: row.checks.filter((check) => check.bucket === "pending").length,
	hasExplanation: row.hasExplanation,
	hasEvidence: row.hasEvidence,
	flowAnswered: row.flowAnswered,
	openFindings: row.openFindings,
	mergeable: row.mergeable,
});
