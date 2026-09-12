import type { CiState, PrState } from "@trellis/api";
import { sql } from "drizzle-orm";
import { iso, rows } from "../db/queries/support.ts";
import type { Tx } from "../db/tx.ts";
import type { PullRequestRef } from "./graphql.ts";

// How often the poller fetches one pull request, counted from its last
// fetch. A pending check is the answer a person waits for, so that pull
// request polls fastest. A pull request that merged or closed keeps polling
// for a day, so a check that finishes late still reaches the ticket.
export const PENDING_INTERVAL_MS = 30_000;
export const OPEN_INTERVAL_MS = 120_000;
export const SETTLED_INTERVAL_MS = 600_000;

// One pull request the poller may fetch. `state`, `ci_state`, and
// `content_hash` are what the answer from gh is compared against.
// `interval_ms` is the cadence this row polls at.
export type DueRow = {
	id: string;
	owner: string;
	repo: string;
	number: number;
	state: PrState;
	ci_state: CiState;
	content_hash: string | null;
	fetched_at: string | null;
	interval_ms: number;
};

export const refOf = (row: DueRow): PullRequestRef => ({ owner: row.owner, repo: row.repo, number: row.number });

const literal = (value: number) => sql.raw(String(value));

// An open PR polls while review_retained is true or an active ticket links it.
// A closed PR polls until one day after its closing time.
export const selectCandidates = (tx: Tx, at: Date): Promise<DueRow[]> =>
	rows<DueRow>(
		tx,
		sql`
			SELECT p.id, p.owner, p.repo, p.number, p.state, p.ci_state, p.content_hash,
				${iso(sql`p.fetched_at`)} AS fetched_at,
				CASE
					WHEN p.state <> 'open' THEN ${literal(SETTLED_INTERVAL_MS)}
					WHEN p.checks @> '[{"bucket": "pending"}]'::jsonb THEN ${literal(PENDING_INTERVAL_MS)}
					ELSE ${literal(OPEN_INTERVAL_MS)}
				END AS interval_ms
			FROM pull_requests p
			WHERE (
					p.state = 'open'
					AND (p.review_retained OR EXISTS (
						SELECT 1 FROM ticket_pull_requests l
						JOIN tickets t ON t.id = l.ticket_id
						JOIN statuses s ON s.id = t.status_id
						WHERE l.pull_request_id = p.id AND s.category NOT IN ('done', 'canceled')
					))
				)
				OR (
					p.state IN ('merged', 'closed')
					AND coalesce(p.merged_at, p.closed_at, p.updated_at) > ${at}::timestamptz - interval '1 day'
				)
			ORDER BY p.id
		`,
	);

// A pull request is due when the interval passed since its last fetch.
// `remembered` is the reading the poller kept for this row, which wins over
// the stored stamp: a fetch that finds the same content writes no row.
//
// A fetch stamp the clock has not passed yet comes from another writer, such
// as pullRequests.refresh or a restored database. The poller fetches such a
// row once and owns its cadence from there.
export const isDue = (row: DueRow, remembered: number | null, atMs: number, multiplier: number): boolean => {
	const last = remembered ?? (row.fetched_at === null ? null : Date.parse(row.fetched_at));
	if (last === null) return true;
	const elapsed = atMs - last;
	return elapsed <= 0 || elapsed >= row.interval_ms * multiplier;
};
