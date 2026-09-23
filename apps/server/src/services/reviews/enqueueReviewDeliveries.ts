import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { authorColumns, authorValues, givenAuthor, type MessageAuthor, writtenBy } from "./deliveryAuthor.ts";
import { newestOpenRun } from "./ticketRun.ts";

// One recipient of the messages of a pull request: a ticket that links the
// pull request, and the agent run that holds that ticket now. `runId` is
// null when no run holds the ticket, and a message for that ticket then
// waits until a run of the ticket starts. `runtime` names the program that
// started the run, and only a run of the runtime `native` reads a message
// that Trellis sends.
export type Recipient = {
	ticketId: string;
	runId: string | null;
	agentName: string | null;
	runtime: string | null;
};

// Every ticket that links the pull request, with the agent run that holds
// it. A ticket whose run wrote the message is no recipient, because no
// agent receives its own words. A message with no author, such as a check
// notice, reaches every ticket.
export const recipientsOf = (tx: Tx, input: { prId: string; author: MessageAuthor | null }) =>
	rows<Recipient>(
		tx,
		sql`SELECT link.ticket_id AS "ticketId", run.id AS "runId", run.name AS "agentName", run.runtime
		FROM ticket_pull_requests link
		${newestOpenRun(sql`link.ticket_id`, sql`assignment.id, assignment.name, assignment.runtime, assignment.ticket_id`)}
		WHERE link.pull_request_id = ${input.prId}
			AND NOT ${writtenBy(givenAuthor(input.author), sql`run`)}
		ORDER BY link.ticket_id`,
	);

// The agent runs among the recipients that can read a message. A person
// reads this list to learn which agent takes the message now.
export const agentsOf = (recipients: Recipient[]) =>
	recipients
		.filter((recipient) => recipient.runId !== null && recipient.runtime === "native")
		.map((recipient) => ({ runId: recipient.runId!, agentName: recipient.agentName! }));

// Queues one review submission for every ticket that links the pull
// request. One row of `review_deliveries` is one message that waits to be
// sent, and `dispatchDeliveries` sends it. The returned list names the
// agents that hold those tickets now.
export const enqueueReviewDeliveries = async (
	tx: Tx,
	input: { reviewId: string; prId: string; author: MessageAuthor },
) => {
	const recipients = await recipientsOf(tx, { prId: input.prId, author: input.author });
	for (const recipient of recipients)
		await tx.execute(
			sql`INSERT INTO review_deliveries (id, review_id, ticket_id, ${authorColumns})
			VALUES (${ulid()}, ${input.reviewId}, ${recipient.ticketId}, ${authorValues(input.author)})`,
		);
	return agentsOf(recipients);
};
