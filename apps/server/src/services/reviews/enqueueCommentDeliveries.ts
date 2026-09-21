import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { Tx } from "../../db/tx.ts";
import { agentsOf } from "./enqueueReviewDeliveries.ts";

// How long one comment waits before the dispatcher may send it. A person
// who writes several comments in a row fills this window, and the
// dispatcher joins every waiting comment of one agent into one message, so
// the agent reads them together and stops its work once.
export const commentBatchSeconds = 5;

// Queues one comment for every agent that holds a ticket of the pull
// request. `messageId` names the comment: the identifier of the thread for
// the first message, and the identifier of the reply for a later one. One
// row of `review_deliveries` is one message that waits to be sent, and
// `dispatchDeliveries` sends it.
export const enqueueCommentDeliveries = async (
	tx: Tx,
	input: { prId: string; threadId: string; messageId: string; at: Date },
) => {
	const due = new Date(input.at.getTime() + commentBatchSeconds * 1000);
	const deliveries = await agentsOf(tx, input.prId);
	for (const delivery of deliveries)
		await tx.execute(
			sql`INSERT INTO review_deliveries (id, thread_id, thread_message_id, run_id, due_at)
			VALUES (${ulid()}, ${input.threadId}, ${input.messageId}, ${delivery.runId}, ${due})`,
		);
	return deliveries;
};
