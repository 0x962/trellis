import type { LocalPrState, PullRequest } from "@trellis/api";
import { sql } from "drizzle-orm";
import { toPullRequest } from "../db/queries/pullRequestRows.ts";
import { rows, textArray } from "../db/queries/support.ts";
import type { Tx } from "../db/tx.ts";
import { findPullRequestRow } from "./findPullRequestRow.ts";
import { linkScope } from "./pullRequestScope.ts";
import { announcePullRequestUpdate } from "./pullRequests.ts";
import { type ServiceCtx, type TicketRow, writeActivity } from "./support.ts";

type TimelineTicket = Pick<TicketRow, "id" | "project_id">;

export type SetLocalStateInput = { id: string; localState: LocalPrState };

// One timeline row per ticket that links the pull request. The timeline
// belongs to a ticket, so a pull request that two tickets link writes two
// rows, and each ticket shows the moment its own wait started.
const writeTimeline = async (ctx: ServiceCtx, tx: Tx, input: { id: string; localState: LocalPrState; at: Date }) => {
	const scope = await linkScope(tx, input.id);
	if (scope.ticketIds.length === 0) return;
	const tickets = await rows<TimelineTicket>(
		tx,
		sql`SELECT id, project_id FROM tickets WHERE id = ANY(${textArray(scope.ticketIds)})`,
	);
	for (const ticket of tickets)
		await writeActivity(ctx, tx, {
			ticket,
			action: input.localState === "ready" ? "pr.ready_for_review" : "pr.not_ready_for_review",
			meta: { pullRequestId: input.id },
			at: input.at,
		});
};

// `trellis ready` writes `ready` after its checks pass, and a person flips
// the state by hand from the pull request sheet. It records that the agent
// asked for review, which is one part of being ready for review;
// `reviewGaps` in `packages/api` holds the whole rule. GitHub never sees
// this state, and a poll or a push leaves it as it is.
//
// `ready_for_review_at` is the moment the wait of the person started. It is
// stamped here and cleared when the agent takes the ask back, so a screen
// can say how long a pull request has waited. The poller clears it when a
// new head commit lands.
//
// A push leaves the stored state at `ready` and clears that moment, so an
// ask for `ready` stamps the new wait even when the stored state does not
// move. A merge leaves the moment, because the wait it measures is the one
// the merge ended.
//
// The update event bumps the version of every linked ticket, so each open
// page reads the new glyph.
export const setLocalState = async (ctx: ServiceCtx, tx: Tx, input: SetLocalStateInput): Promise<PullRequest> => {
	const row = await findPullRequestRow(tx, input.id);
	const asksAgain = input.localState === "ready" && row.ready_for_review_at === null;
	if (row.local_state === input.localState && !asksAgain) return toPullRequest(row);
	const at = ctx.now();
	await tx.execute(sql`UPDATE pull_requests
		SET local_state = ${input.localState},
			ready_for_review_at = ${input.localState === "ready" ? at : null}
		WHERE id = ${row.id}`);
	await writeTimeline(ctx, tx, { id: row.id, localState: input.localState, at });
	const updated = await findPullRequestRow(tx, row.id);
	await announcePullRequestUpdate(ctx, tx, updated);
	return toPullRequest(updated);
};
