import { type SQL, sql } from "drizzle-orm";
import type { Tx } from "../tx.ts";
import { iso, rows } from "./support.ts";

// One group of a statistics fault: how many rows hold the fault, and the
// oldest of them. `identifier` and `title` name the ticket of the oldest
// row, and both are null when that row names no ticket.
export type FaultGroup = {
	// `state` for a review message, `status` for a flow run.
	key: string;
	count: number;
	identifier: string | null;
	title: string | null;
	since: string;
};

// The ticket of the oldest row of each group, its title, and the count of
// the group. `DISTINCT ON` keeps the first row of each group under the
// `ORDER BY`, which the age sorts, and the window function counts the whole
// group beside it.
const groups = (from: SQL, key: SQL, age: SQL) => sql`
	SELECT DISTINCT ON (${key})
		${key} AS key,
		count(*) OVER (PARTITION BY ${key})::int AS count,
		root.key || '-' || ticket.number AS identifier,
		ticket.title,
		${iso(age)} AS since
	${from}
	ORDER BY ${key}, ${age} ASC
`;

// The review messages that never reached an agent, grouped by state. `held`
// means the ticket of the message runs no agent. `failed` means the delivery
// loop stopped the message and kept the reason. `due_at` is the moment the
// message joined the queue, so it is the start of the wait.
//
// The join to the ticket is a LEFT JOIN: migration 0101 gave every message
// whose run held no ticket the state `failed` and no recipient.
export const stuckReviewMessages = (tx: Tx) =>
	rows<FaultGroup>(
		tx,
		groups(
			sql`FROM review_deliveries delivery
				LEFT JOIN tickets ticket ON ticket.id = delivery.ticket_id
				LEFT JOIN projects root ON root.id = ticket.project_id
				WHERE delivery.state IN ('held', 'failed')`,
			sql`delivery.state`,
			sql`delivery.due_at`,
		),
	);

// The flow runs that reached no end state, grouped by status. `waiting`
// means the run sits at a step that only a person answers. `running` means
// the run holds a step that the flow engine still drives. `updated_at` is
// the last write to the run, so the age says how long the run has not
// moved.
export const openFlowRuns = (tx: Tx) =>
	rows<FaultGroup>(
		tx,
		groups(
			sql`FROM flow_executions run
				JOIN tickets ticket ON ticket.id = run.ticket_id
				JOIN projects root ON root.id = ticket.project_id
				WHERE run.state->>'status' IN ('waiting', 'running')`,
			sql`run.state->>'status'`,
			sql`run.updated_at`,
		),
	);
