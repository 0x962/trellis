import type { Inbox, InboxSection } from "@trellis/api";
import { type SQL, sql } from "drizzle-orm";
import type { Tx } from "../tx.ts";
import { rows, textArray } from "./support.ts";
import { type SummaryRow, summaryStatement, toSummary } from "./ticketSummary.ts";

// `stalledBefore` is now minus the stalled threshold; `todayStart` is the
// local midnight the "done by agents today" section counts from.
export type InboxInput = {
	projectIds?: readonly string[];
	stalledBefore: Date;
	todayStart: Date;
};

export const INBOX_SECTION_LIMIT = 100;

// One section: the first 100 matching tickets in `order` and the count of
// the whole section from a window over the same rows.
const section = async (tx: Tx, scope: SQL, where: SQL, order: SQL): Promise<InboxSection> => {
	const page = sql`page AS (
		SELECT t.id, row_number() OVER (ORDER BY ${order}) AS rn, count(*) OVER ()::int AS total
		FROM tickets t JOIN statuses s ON s.id = t.status_id
		WHERE ${scope} AND ${where}
		ORDER BY ${order}
		LIMIT ${INBOX_SECTION_LIMIT}
	)`;
	const found = await rows<SummaryRow & { total: number }>(tx, summaryStatement(page, sql`, page.total`, sql`page.rn`));
	return { items: found.map(toSummary), total: found[0]?.total ?? 0 };
};

const oldestFirst = sql`t.updated_at ASC, t.id DESC`;

// The home screen sections. Review: open tickets in a status a human
// reviews. Failing CI: open tickets with an open pull request whose CI
// fails. Stalled: tickets in a started status untouched since the
// threshold. Done by agents today: tickets an agent moved into a done
// category since the day started, read from the activity meta so a status
// deleted since then still counts.
export const inbox = async (tx: Tx, input: InboxInput): Promise<Inbox> => {
	const scope = input.projectIds ? sql`t.project_id = ANY(${textArray(input.projectIds)})` : sql`true`;
	const open = sql`t.completed_at IS NULL`;
	const review = await section(tx, scope, sql`${open} AND s.category = 'review' AND s.reviewer = 'human'`, oldestFirst);
	const failingCi = await section(
		tx,
		scope,
		sql`${open} AND EXISTS (
			SELECT 1 FROM ticket_pull_requests l JOIN pull_requests p ON p.id = l.pull_request_id
			WHERE l.ticket_id = t.id AND p.state = 'open' AND p.ci_state = 'fail')`,
		oldestFirst,
	);
	const stalled = await section(
		tx,
		scope,
		sql`${open} AND s.category = 'started' AND t.updated_at < ${input.stalledBefore.toISOString()}::timestamptz`,
		oldestFirst,
	);
	const doneByAgentsToday = await section(
		tx,
		scope,
		sql`EXISTS (
			SELECT 1 FROM activity a
			WHERE a.ticket_id = t.id AND a.actor_kind = 'agent' AND a.meta->>'toCategory' = 'done'
				AND a.created_at >= ${input.todayStart.toISOString()}::timestamptz)`,
		sql`t.updated_at DESC, t.id DESC`,
	);
	return { review, failingCi, stalled, doneByAgentsToday };
};
