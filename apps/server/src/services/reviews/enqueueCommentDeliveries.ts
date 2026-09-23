import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { Tx } from "../../db/tx.ts";
import type { ActorRef } from "../support.ts";
import { authorColumns, authorValues, messageAuthor } from "./deliveryAuthor.ts";
import { agentsOf, recipientsOf } from "./enqueueReviewDeliveries.ts";

// How long the comments for one agent wait after the newest of them. Each
// new comment moves `due_at` of its own row this far ahead, and the
// dispatcher sends the waiting comments of an agent only when the newest
// row is due. Ten comments in a row therefore stop the agent once, with one
// message.
export const commentBatchSeconds = 5;

// The longest time the oldest waiting comment of an agent can wait. A
// reviewer who keeps writing never lets the newest row fall due, so after
// this time the dispatcher sends the whole group anyway.
export const commentBatchLimitSeconds = 30;

// Queues one comment for every ticket that links the pull request.
// `messageId` names the comment: the identifier of the thread for the first
// message, and the identifier of the reply for a later one. One row of
// `review_deliveries` is one message that waits to be sent, and
// `dispatchDeliveries` sends it. A ticket whose agent does not run keeps
// the comment in the state `held`, and the next run of that ticket reads
// it. The agent that wrote the comment receives no row, and every queued
// row carries the author, because the agent of the ticket can change
// before the send.
export const enqueueCommentDeliveries = async (
	tx: Tx,
	input: { prId: string; threadId: string; messageId: string; author: ActorRef; at: Date },
) => {
	const due = new Date(input.at.getTime() + commentBatchSeconds * 1000);
	const author = await messageAuthor(tx, input.author);
	const recipients = await recipientsOf(tx, { prId: input.prId, author });
	for (const recipient of recipients)
		await tx.execute(
			sql`INSERT INTO review_deliveries (id, thread_id, thread_message_id, ticket_id, due_at, ${authorColumns})
			VALUES (${ulid()}, ${input.threadId}, ${input.messageId}, ${recipient.ticketId}, ${due}, ${authorValues(author)})`,
		);
	return agentsOf(recipients);
};
