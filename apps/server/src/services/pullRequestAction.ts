import type { PullRequest } from "@trellis/api";
import { sql } from "drizzle-orm";
import { localReviewState } from "../db/queries/pullRequestRows.ts";
import { rows } from "../db/queries/support";
import type { Tx } from "../db/tx";
import type { PullRequestRow } from "../gh/graphql";
import { refresh } from "./pullRequests";
import { ensurePr } from "./reviews/queries";
import { type IoCtx, type TicketRow, touchTicket, writeActivity } from "./support";

export const recordAction = async (
	ctx: IoCtx,
	tx: Tx,
	input: { row: PullRequestRow; action: string },
): Promise<PullRequest> => {
	const stored = await ensurePr(tx, input.row.url);
	const [before] = await rows<{ content_hash: string | null; review_state: PullRequest["reviewState"] }>(
		tx,
		sql`SELECT p.content_hash, ${localReviewState(sql`p.id`)} AS review_state
			FROM pull_requests p WHERE p.id = ${stored.id}`,
	);
	const fresh = await refresh(ctx, tx, {
		id: stored.id,
		first: {
			ref: { owner: input.row.owner, repo: input.row.repo, number: input.row.number },
			row: input.row,
		},
	});
	const linked = await rows<TicketRow>(
		tx,
		sql`
			SELECT t.id, t.project_id, NULL AS archived_at
			FROM ticket_pull_requests l JOIN tickets t ON t.id = l.ticket_id
			WHERE l.pull_request_id = ${fresh.id}
			ORDER BY l.created_at, t.id
		`,
	);
	const activityAction = ["comment", "approve", "request_changes"].includes(input.action)
		? "pr.reviewed"
		: "pr.actioned";
	for (const ticket of linked) {
		await touchTicket(tx, { id: ticket.id, at: ctx.now(), versionStep: 1 });
		await writeActivity(ctx, tx, {
			ticket,
			action: activityAction,
			meta: {
				pullRequestId: fresh.id,
				url: fresh.url,
				action: input.action,
				fromReviewState: before!.review_state,
				toReviewState: fresh.reviewState,
			},
			at: ctx.now(),
		});
	}
	if (before!.content_hash === input.row.contentHash) {
		ctx.emit({
			type: "pr.updated",
			id: fresh.id,
			ticketIds: linked.map((ticket) => ticket.id),
			projectIds: [...new Set(linked.map((ticket) => ticket.project_id))],
			state: fresh.state,
			ciState: fresh.ciState,
		});
	}
	return fresh;
};
