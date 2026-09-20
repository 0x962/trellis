import type { EpicCounts, MilestoneSummary } from "@trellis/api";
import { sql } from "drizzle-orm";
import { iso } from "../../db/queries/support.ts";
import { stateOf, ticketCounts, toCounts } from "../epics/rows.ts";

// One milestone row with the columns of the wire, plus the root key and the
// epic slug for the ref, the project of the epic for the archive rule, and
// the ticket counts by status category.
export type RawMilestone = EpicCounts & {
	id: string;
	epic_id: string;
	epic_slug: string;
	epic_project_id: string;
	root_id: string;
	root_key: string;
	slug: string;
	name: string;
	position: number;
	to_start: number;
	waits_for_you: number;
	created_at: string;
	updated_at: string;
};

// The canonical ref of a milestone: the root key, the epic slug, and the
// milestone slug, joined with slashes.
export const milestoneRefOf = (row: { root_key: string; epic_slug: string; slug: string }) =>
	`${row.root_key}/${row.epic_slug}/${row.slug}`;

// The counts that tell the person what is next in a milestone. A todo ticket
// can start when every ticket that it depends on is done. A human-review
// ticket is one row for the person. Each fetched pull request that has no
// draft, failed check, pending check, or open thread is another row.
const nextCounts = sql`,
			(count(*) FILTER (WHERE s.category = 'todo' AND NOT EXISTS (
				SELECT 1 FROM ticket_deps dependency
				JOIN tickets blocker ON blocker.id = dependency.depends_on_id
				JOIN statuses blocker_status ON blocker_status.id = blocker.status_id
				WHERE dependency.ticket_id = t.id AND blocker_status.category <> 'done'
			)))::int AS to_start,
			(
				count(*) FILTER (WHERE s.reviewer = 'human') +
				(
					SELECT count(*) FROM ticket_pull_requests link
					JOIN tickets linked_ticket ON linked_ticket.id = link.ticket_id
					JOIN pull_requests pull_request ON pull_request.id = link.pull_request_id
					WHERE linked_ticket.milestone_id = m.id
						AND pull_request.fetched_at IS NOT NULL
						AND pull_request.fetch_error IS NULL
						AND pull_request.state = 'open'
						AND NOT pull_request.is_draft
						AND pull_request.ci_state IN ('none', 'pass')
						AND NOT EXISTS (
							SELECT 1 FROM review_threads thread
							WHERE thread.pr_id = pull_request.id AND thread.document->>'status' = 'open'
						)
				)
			)::int AS waits_for_you`;

// `c` holds the counts of the tickets that point at the milestone.
export const milestoneSelect = sql`SELECT m.id, m.epic_id, e.slug AS epic_slug, e.project_id AS epic_project_id,
	m.root_id, root.key AS root_key, m.slug, m.name, m.position,
	c.total, c.todo, c.started, c.review, c.done, c.canceled, c.to_start, c.waits_for_you,
	${iso(sql`m.created_at`)} AS created_at, ${iso(sql`m.updated_at`)} AS updated_at
	FROM milestones m
	JOIN epics e ON e.id = m.epic_id
	JOIN projects root ON root.id = m.root_id
	${ticketCounts(sql`t.milestone_id = m.id`, nextCounts)}`;

// The order of the milestones inside one epic. A create takes the highest
// position of the epic plus 1, and a reorder writes 0 to n minus 1, so two
// milestones of one epic never share a position.
export const milestoneOrder = sql`m.position, m.id`;

export const toMilestoneSummary = (row: RawMilestone): MilestoneSummary => {
	const counts = toCounts(row);
	return {
		id: row.id,
		epicId: row.epic_id,
		ref: milestoneRefOf(row),
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
