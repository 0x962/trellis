import type { StatisticsBillRow } from "@trellis/api";
import { type SQL, sql } from "drizzle-orm";
import type { Tx } from "../tx.ts";
import { submissionByPerson } from "./pullRequestRows.ts";
import { iso, rows } from "./support.ts";

export type LoopTotals = {
	merged: number;
	oldestMergedAt: string | null;
	sentBack: number;
	withPersonVerdict: number;
	threadsByPerson: number;
	threadsByAgent: number;
	readyToVerdictMs: number | null;
	readyToVerdictMeasured: number;
};

// The newest merged pull requests, most recent first. The window is a count
// of pull requests, so every figure of block two shares one denominator.
const merged = (size: number) => sql`win AS (
	SELECT id, merged_at FROM pull_requests
	WHERE merged_at IS NOT NULL
	ORDER BY merged_at DESC
	LIMIT ${size}
)`;

// How many verdicts a person gave on one pull request. An agent submits a
// review from the CLI too, so the kind of the actor decides, not the row.
const personVerdicts = (prId: SQL) => sql`(
	SELECT count(*) FROM review_submissions submission
	WHERE submission.pr_id = ${prId} AND ${submissionByPerson(sql`submission`)}
)`;

// How often a person asked for a change on one pull request. Each verdict is
// one round of review.
const personSentBack = (prId: SQL) => sql`(
	SELECT count(*) FROM review_submissions submission
	WHERE submission.pr_id = ${prId} AND ${submissionByPerson(sql`submission`)}
		AND submission.document->>'verdict' = 'changes_requested'
)`;

// The counts of block two over one window of merged pull requests. Every
// thread count reads `review_threads`. A submission document carries the
// same threads inside it, so a count that reads both counts a thread twice.
//
// `readyToVerdictMs` is the median wait from the moment a pull request
// became ready to the first verdict of a person on it. `pull_requests`
// holds the start of that wait in `ready_for_review_at`, and a new head
// commit clears it, so the stamp is the last moment the pull request asked
// for a review. `readyToVerdictMeasured` says how many pull requests of the
// window carry both the stamp and a verdict after it, which is the number
// the median covers.
export const loopTotals = async (tx: Tx, size: number): Promise<LoopTotals> => {
	const [row] = await rows<LoopTotals>(
		tx,
		sql`WITH ${merged(size)},
		verdicts AS (
			SELECT ${personSentBack(sql`win.id`)} AS sent_back, ${personVerdicts(sql`win.id`)} AS given
			FROM win
		),
		waits AS (
			SELECT extract(epoch FROM (verdict.at - pr.ready_for_review_at)) * 1000 AS ms
			FROM win
			JOIN pull_requests pr ON pr.id = win.id
			CROSS JOIN LATERAL (
				SELECT min(submission.created_at) AS at
				FROM review_submissions submission
				WHERE submission.pr_id = win.id AND ${submissionByPerson(sql`submission`)}
					AND submission.created_at >= pr.ready_for_review_at
			) verdict
			WHERE pr.ready_for_review_at IS NOT NULL AND verdict.at IS NOT NULL
		),
		threads AS (
			SELECT
				count(*) FILTER (WHERE thread.document->>'kind' = 'human')::int AS by_person,
				count(*) FILTER (WHERE thread.document->>'kind' = 'agent')::int AS by_agent
			FROM review_threads thread JOIN win ON win.id = thread.pr_id
		)
		SELECT
			(SELECT count(*) FROM win)::int AS merged,
			${iso(sql`(SELECT min(merged_at) FROM win)`)} AS "oldestMergedAt",
			(SELECT count(*) FROM verdicts WHERE sent_back > 0)::int AS "sentBack",
			(SELECT count(*) FROM verdicts WHERE given > 0)::int AS "withPersonVerdict",
			threads.by_person AS "threadsByPerson",
			threads.by_agent AS "threadsByAgent",
			(SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY ms) FROM waits)::double precision AS "readyToVerdictMs",
			(SELECT count(*) FROM waits)::int AS "readyToVerdictMeasured"
		FROM threads`,
	);
	return row!;
};

// The pull requests of the window that took the most writing from a person,
// most first. A pull request with no thread from a person is not in the
// list. `ticket` is the ticket that was linked first, and it is null when no
// ticket links the pull request.
export const loopBill = (tx: Tx, size: number, limit: number) =>
	rows<StatisticsBillRow>(
		tx,
		sql`WITH ${merged(size)},
		bill AS (
			SELECT thread.pr_id, count(*)::int AS threads
			FROM review_threads thread JOIN win ON win.id = thread.pr_id
			WHERE thread.document->>'kind' = 'human'
			GROUP BY thread.pr_id
		)
		SELECT pr.id AS "prId",
			(
				SELECT proj.key || '-' || ticket.number
				FROM ticket_pull_requests link
				JOIN tickets ticket ON ticket.id = link.ticket_id
				JOIN projects proj ON proj.id = ticket.project_id
				WHERE link.pull_request_id = pr.id
				ORDER BY link.created_at ASC, ticket.id ASC
				LIMIT 1
			) AS ticket,
			pr.title, pr.url,
			bill.threads AS "threadsByPerson",
			${personSentBack(sql`pr.id`)}::int AS "sentBack",
			${iso(sql`pr.merged_at`)} AS "mergedAt"
		FROM bill JOIN pull_requests pr ON pr.id = bill.pr_id
		ORDER BY bill.threads DESC, pr.merged_at DESC
		LIMIT ${limit}`,
	);
