import type { CiState, PrState, ReviewState, ReviewSubmission, ReviewSubmit, ReviewThread } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { localReviewState } from "../../db/queries/pullRequestRows.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { type ServiceCtx, type TicketRow, touchTicket, writeActivity } from "../support.ts";
import { messageAuthor } from "./deliveryAuthor.ts";
import { enqueueReviewDeliveries } from "./enqueueReviewDeliveries.ts";

// A stored submission uses the verdict words of the public review schema.
const verdictWords: Record<ReviewSubmit["verdict"], ReviewSubmission["verdict"]> = {
	comment: "commented",
	approve: "approved",
	request_changes: "changes_requested",
};

export type SubmissionInput = {
	prId: string;
	verdict: ReviewSubmit["verdict"];
	// The pull request address that lets the agent open the local threads.
	url: string;
	// The local actor that submitted the verdict.
	author: string;
	body: string;
	revisionId: string | null;
	threads: ReviewThread[];
};

// Stores one local verdict and queues it for each agent that holds a linked
// ticket. The delivery loop sends the queued rows after this transaction.
export const recordSubmission = async (ctx: ServiceCtx, tx: Tx, input: SubmissionInput) => {
	const id = ulid();
	const [pullRequest] = await rows<{ state: PrState; ciState: CiState; reviewState: ReviewState }>(
		tx,
		sql`SELECT p.state, p.ci_state AS "ciState", ${localReviewState(sql`p.id`)} AS "reviewState"
			FROM pull_requests p WHERE p.id = ${input.prId}`,
	);
	// `reviews.submissions` reads `headSha` and `byPerson` from the revision
	// and actor tables, so the stored document does not hold them.
	const document: Omit<ReviewSubmission, "headSha" | "byPerson"> = {
		id,
		prId: input.prId,
		url: input.url,
		author: input.author,
		verdict: verdictWords[input.verdict],
		body: input.body,
		revisionId: input.revisionId,
		threads: input.threads,
		createdAt: ctx.now().toISOString(),
		deliveries: [],
	};
	// The unique rule of the table is the triple of the pull request, the
	// actor and the request. This call has no request identifier of its own,
	// so the row identifier fills that place and no two submissions collide.
	await tx.execute(
		sql`INSERT INTO review_submissions (id, pr_id, request_id, actor, document, created_at)
		VALUES (${id}, ${input.prId}, ${id}, ${ctx.actor.name}, ${JSON.stringify(document)}::jsonb, ${ctx.now()})`,
	);
	const recipients = await enqueueReviewDeliveries(tx, {
		reviewId: id,
		prId: input.prId,
		author: await messageAuthor(tx, ctx.actor),
	});
	const linked = await rows<TicketRow>(
		tx,
		sql`SELECT ticket.id, ticket.project_id, NULL AS archived_at
			FROM ticket_pull_requests link
			JOIN tickets ticket ON ticket.id = link.ticket_id
			WHERE link.pull_request_id = ${input.prId}
			ORDER BY link.created_at, ticket.id`,
	);
	for (const ticket of linked) {
		await touchTicket(tx, { id: ticket.id, at: ctx.now(), versionStep: 1 });
		await writeActivity(ctx, tx, {
			ticket,
			action: "pr.reviewed",
			meta: {
				pullRequestId: input.prId,
				url: input.url,
				action: input.verdict,
				fromReviewState: pullRequest!.reviewState,
				toReviewState: verdictWords[input.verdict],
			},
			at: ctx.now(),
		});
	}
	ctx.emit({
		type: "pr.updated",
		id: input.prId,
		ticketIds: linked.map((ticket) => ticket.id),
		projectIds: [...new Set(linked.map((ticket) => ticket.project_id))],
		state: pullRequest!.state,
		ciState: pullRequest!.ciState,
	});
	ctx.emit({
		type: "reviews.changed",
		id: input.prId,
		ticketIds: linked.map((ticket) => ticket.id),
		projectIds: [...new Set(linked.map((ticket) => ticket.project_id))],
	});
	return { id, recipients };
};
