import type { ReviewSubmission, ReviewSubmit, ReviewThread } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { Tx } from "../../db/tx.ts";
import type { ServiceCtx } from "../support.ts";
import { enqueueReviewDeliveries } from "./enqueueReviewDeliveries.ts";

// GitHub names a review by the state it leaves behind, and a stored
// submission keeps that word.
const verdictWords: Record<ReviewSubmit["verdict"], ReviewSubmission["verdict"]> = {
	comment: "commented",
	approve: "approved",
	request_changes: "changes_requested",
};

export type SubmissionInput = {
	prId: string;
	verdict: ReviewSubmit["verdict"];
	// The address of the review on GitHub, from the answer of the call that
	// created it.
	url: string;
	// The GitHub login that GitHub recorded as the reviewer.
	author: string;
	body: string;
	revisionId: string | null;
	threads: ReviewThread[];
	sendBack: boolean;
};

// Stores the review that GitHub accepted. With `sendBack` it also queues the
// review for the agent of each ticket of the pull request; the delivery loop
// sends those rows, and this write only stores them.
export const recordSubmission = async (ctx: ServiceCtx, tx: Tx, input: SubmissionInput) => {
	const id = ulid();
	const document: ReviewSubmission = {
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
	if (!input.sendBack) return { id, deliveries: [] };
	return { id, deliveries: await enqueueReviewDeliveries(tx, { reviewId: id, prId: input.prId }) };
};
