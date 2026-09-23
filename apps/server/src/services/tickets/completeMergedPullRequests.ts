import { sql } from "drizzle-orm";
import { type ServiceCtx, SYSTEM_ACTOR } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { record } from "../activity.ts";
import { move } from "./move.ts";

export const doneByPullRequestsTimelineText = "Done: every pull request merged";

type Candidate = { id: string; projectId: string };

const candidates = (tx: Tx, pullRequestId?: string) =>
	rows<Candidate>(
		tx,
		sql`
			SELECT t.id, t.project_id AS "projectId"
			FROM tickets t
			JOIN statuses s ON s.id = t.status_id
			JOIN ticket_pull_requests link ON link.ticket_id = t.id
			JOIN pull_requests pr ON pr.id = link.pull_request_id
			WHERE s.category NOT IN ('done', 'canceled')
				AND (${pullRequestId ?? null}::text IS NULL OR EXISTS (
					SELECT 1 FROM ticket_pull_requests scoped
					WHERE scoped.ticket_id = t.id AND scoped.pull_request_id = ${pullRequestId ?? null}
				))
			GROUP BY t.id, t.project_id
			HAVING bool_or(pr.state = 'merged') AND bool_and(pr.state IN ('merged', 'closed'))
			ORDER BY t.id
		`,
	);

export const completeMergedPullRequestTickets = async (
	ctx: ServiceCtx,
	tx: Tx,
	input: { pullRequestId?: string } = {},
) => {
	const system = { ...ctx, actor: SYSTEM_ACTOR };
	const moved: string[] = [];
	for (const row of await candidates(tx, input.pullRequestId)) {
		await move(system, tx, { ticket: row.id, status: "category:done" });
		await record(system, tx, {
			projectId: row.projectId,
			ticketId: row.id,
			action: "ticket.done_by_pull_requests",
			changes: [{ field: null, from: null, to: doneByPullRequestsTimelineText }],
		});
		moved.push(row.id);
	}
	return moved;
};
