import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";

// The open agent assignment of every ticket that links the pull request.
// `agent_runs` holds one open row per ticket for a run of kind `agent`, so
// each linked ticket gives one row at most. A row whose process already
// ended still counts: the person restarts that agent, and the delivery
// waits for its terminal.
export const agentsOf = (tx: Tx, prId: string) =>
	rows<{ runId: string; agentName: string }>(
		tx,
		sql`SELECT run.id AS "runId", run.name AS "agentName"
		FROM ticket_pull_requests link
		JOIN agent_runs run ON run.ticket_id = link.ticket_id
		WHERE link.pull_request_id = ${prId}
			AND run.kind = 'agent' AND run.runtime = 'native' AND run.closed_at IS NULL
		ORDER BY run.id`,
	);

// Queues one review submission for every agent that holds a ticket of the
// pull request. One row of `review_deliveries` is one message that waits to
// be sent, and `dispatchDeliveries` sends it. The returned list names the
// agents the review goes to.
export const enqueueReviewDeliveries = async (tx: Tx, input: { reviewId: string; prId: string }) => {
	const deliveries = await agentsOf(tx, input.prId);
	for (const delivery of deliveries)
		await tx.execute(
			sql`INSERT INTO review_deliveries (id, review_id, run_id)
			VALUES (${ulid()}, ${input.reviewId}, ${delivery.runId})`,
		);
	return deliveries;
};
