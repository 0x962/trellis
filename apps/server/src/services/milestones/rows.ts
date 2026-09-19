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
	running: number;
	waits_for_you: number;
	created_at: string;
	updated_at: string;
};

// The canonical ref of a milestone: the root key, the epic slug, and the
// milestone slug, joined with slashes.
export const milestoneRefOf = (row: { root_key: string; epic_slug: string; slug: string }) =>
	`${row.root_key}/${row.epic_slug}/${row.slug}`;

// True for a ticket `t` with an open agent run. One ticket holds at most one
// open agent run, because the index `agent_runs_active_ticket_idx` is unique.
const hasOpenRun = sql`EXISTS (
		SELECT 1 FROM agent_runs r WHERE r.kind = 'agent' AND r.closed_at IS NULL AND r.ticket_id = t.id
	)`;

// The counts that tell the person what is next in a milestone. A ticket with
// an open agent run counts in `running` in every status category.
const nextCounts = sql`,
			(count(*) FILTER (WHERE s.category = 'todo' AND NOT ${hasOpenRun}))::int AS to_start,
			(count(*) FILTER (WHERE ${hasOpenRun}))::int AS running,
			(count(*) FILTER (WHERE s.reviewer = 'human'))::int AS waits_for_you`;

// `c` holds the counts of the tickets that point at the milestone.
export const milestoneSelect = sql`SELECT m.id, m.epic_id, e.slug AS epic_slug, e.project_id AS epic_project_id,
	m.root_id, root.key AS root_key, m.slug, m.name, m.position,
	c.total, c.todo, c.started, c.review, c.done, c.canceled, c.to_start, c.running, c.waits_for_you,
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
		running: row.running,
		waitsForYou: row.waits_for_you,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
};
