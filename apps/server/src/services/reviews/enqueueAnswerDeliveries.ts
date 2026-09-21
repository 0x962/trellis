import type { TicketAnswerDelivery } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";

// One row per agent that still works on a ticket which waits for the
// question. `agent_runs` holds one open row per ticket for a run of kind
// `agent`, so each waiting ticket gives one row at most.
const agentsWaitingFor = (tx: Tx, questionId: string) =>
	rows<TicketAnswerDelivery>(
		tx,
		sql`SELECT run.id AS "runId", run.name AS "agentName", root.key || '-' || waiting.number AS ticket
		FROM ticket_deps dependency
		JOIN tickets waiting ON waiting.id = dependency.ticket_id
		JOIN projects root ON root.id = waiting.root_id
		JOIN agent_runs run ON run.ticket_id = waiting.id
		WHERE dependency.depends_on_id = ${questionId}
			AND run.kind = 'agent' AND run.runtime = 'native' AND run.closed_at IS NULL
		ORDER BY waiting.number, run.id`,
	);

// Queues the answer of a question ticket for every agent that waits for it.
// One row of `review_deliveries` is one message that waits to be sent, and
// `dispatchDeliveries` sends it. The returned list names the agents
// the answer goes to.
export const enqueueAnswerDeliveries = async (
	tx: Tx,
	input: { commentId: string; questionId: string },
): Promise<TicketAnswerDelivery[]> => {
	const deliveries = await agentsWaitingFor(tx, input.questionId);
	for (const delivery of deliveries)
		await tx.execute(
			sql`INSERT INTO review_deliveries (id, answer_comment_id, run_id)
			VALUES (${ulid()}, ${input.commentId}, ${delivery.runId})`,
		);
	return deliveries;
};
