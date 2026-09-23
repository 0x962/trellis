import type { Check, LocalPrState, Mergeable, PrState, ReviewReadyFacts } from "@trellis/api";
import { type SQL, sql } from "drizzle-orm";
import { flowAppliesToProject } from "./flowScope.ts";

// The facts that `reviewGaps` in `packages/api` reads, in SQL. `p` is the
// alias of the `pull_requests` row in the caller's query.

// The tickets that link this pull request. A flow run belongs to a ticket,
// so a run reaches the pull request through this set.
const linkedTickets = (p: SQL) => sql`SELECT pr_link.ticket_id
	FROM ticket_pull_requests pr_link WHERE pr_link.pull_request_id = ${p}.id`;

// True when some flow applies to the project of a ticket that links this
// pull request. A flow belongs to one root project, or to every project, and
// `flowAppliesToProject` is the one rule for that. `trellis ready` asks the
// flows service the same question, so both answer alike.
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
		SELECT 1 FROM flow_executions execution
		WHERE execution.ticket_id IN (${linkedTickets(p)})
			AND execution.state->>'status' = 'succeeded'
	)
)`;

// The agent writes the explanation for one commit, so a push takes it away.
export const hasExplanationSql = (p: SQL) => sql`EXISTS (
	SELECT 1 FROM pr_summaries summary
	WHERE summary.pull_request_id = ${p}.id AND summary.head_sha = ${p}.head_sha
)`;

// One evidence document per pull request, and a new write replaces it. The
// document names the commit it proves, so a push takes it away the way it
// takes the explanation away.
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
