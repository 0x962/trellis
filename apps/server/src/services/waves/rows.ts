import type { EpicCounts, WaveSummary } from "@trellis/api";
import { type SQL, sql } from "drizzle-orm";
import { notReadyForReviewSql } from "../../db/queries/reviewReady.ts";
import { iso } from "../../db/queries/support.ts";
import { stateOf, ticketCounts, toCounts } from "../epics/rows.ts";

// One wave row with the columns of the wire, plus the root key and the
// epic slug for the ref, the project of the epic for the archive rule, and
// the ticket counts by status category.
export type RawWave = EpicCounts & {
	id: string;
	epic_id: string;
	epic_slug: string;
	epic_project_id: string;
	project_key: string;
	slug: string;
	name: string;
	position: number;
	to_start: number;
	waits_for_you: number;
	created_at: string;
	updated_at: string;
};

// The canonical ref of a wave: the root key, the epic slug, and the
// wave slug, joined with slashes.
export const waveRefOf = (row: { project_key: string; epic_slug: string; slug: string }) =>
	`${row.project_key}/${row.epic_slug}/${row.slug}`;

const hasLinkedPullRequest = (condition: SQL) => sql`EXISTS (
	SELECT 1 FROM ticket_pull_requests link
	JOIN pull_requests pull_request ON pull_request.id = link.pull_request_id
	WHERE link.ticket_id = t.id AND ${condition}
)`;

// An open pull request that is not ready for review waits for its agent,
// and one that is ready waits for the person. `notReadyForReviewSql` is the
// SQL form of the `reviewGaps` rule in `packages/api`, so this count and the
// turn of a row answer alike.
const hasPullRequestNotReady = hasLinkedPullRequest(notReadyForReviewSql(sql`pull_request`));

const hasReadyPullRequest = hasLinkedPullRequest(sql`
	pull_request.fetched_at IS NOT NULL
	AND pull_request.fetch_error IS NULL
	AND pull_request.state = 'open'
	AND NOT ${notReadyForReviewSql(sql`pull_request`)}
`);

// The counts that tell the person what is next in a wave. A todo ticket
// can start when every ticket that it depends on is done or canceled.
// `packages/api/src/turn/turn.ts` defines whose turn a ticket has.
// `waits_for_you` is its SQL form for the status and pull request fields in
// the database. Each ticket adds at most one to the count.
const nextCounts = sql`,
			(count(*) FILTER (WHERE s.category = 'todo' AND NOT EXISTS (
				SELECT 1 FROM ticket_deps dependency
				JOIN tickets blocker ON blocker.id = dependency.depends_on_id
				JOIN statuses blocker_status ON blocker_status.id = blocker.status_id
				WHERE dependency.ticket_id = t.id AND blocker_status.category NOT IN ('done', 'canceled')
			)))::int AS to_start,
			(count(*) FILTER (WHERE
				s.category NOT IN ('done', 'canceled')
				AND (
					s.category = 'review'
					OR (NOT ${hasPullRequestNotReady} AND ${hasReadyPullRequest})
				)
			))::int AS waits_for_you`;

// `c` holds the counts of the tickets that point at the wave.
export const waveSelect = sql`SELECT m.id, m.epic_id, e.slug AS epic_slug, e.project_id AS epic_project_id,
	proj.key AS project_key, m.slug, m.name, m.position,
	c.total, c.todo, c.started, c.review, c.done, c.canceled, c.to_start, c.waits_for_you,
	${iso(sql`m.created_at`)} AS created_at, ${iso(sql`m.updated_at`)} AS updated_at
	FROM waves m
	JOIN epics e ON e.id = m.epic_id
	JOIN projects proj ON proj.id = e.project_id
	${ticketCounts(sql`t.wave_id = m.id`, nextCounts)}`;

// The order of the waves inside one epic. A create takes the highest
// position of the epic plus 1, and a reorder writes 0 to n minus 1, so two
// waves of one epic never share a position.
export const waveOrder = sql`m.position, m.id`;

export const toWaveSummary = (row: RawWave): WaveSummary => {
	const counts = toCounts(row);
	return {
		id: row.id,
		epicId: row.epic_id,
		ref: waveRefOf(row),
		slug: row.slug,
		name: row.name,
		position: row.position,
		counts,
		state: stateOf(counts),
		toStart: row.to_start,
		waitsForYou: row.waits_for_you,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
};
