import type { ReviewMessageDelivery, ReviewThread } from "@trellis/api";
import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support";
import type { Tx } from "../../db/tx";

// The order that decides the one word a message shows. A comment can go to
// several agents, one row per agent. The reader needs the worst of them: a
// send that failed matters more than a send that arrived.
const rank: Record<ReviewMessageDelivery["state"], number> = {
	sent: 0,
	sending: 1,
	pending: 2,
	unknown: 3,
	failed: 4,
};

const worse = (left: ReviewMessageDelivery, right: ReviewMessageDelivery) =>
	rank[right.state] > rank[left.state] ? right : left;

// Reads how far every message of these threads got on its way to the agents
// of the pull request, and writes the state on the message. A message that
// Trellis queued for no agent keeps no state.
export const withDeliveries = async (tx: Tx, threads: ReviewThread[]): Promise<ReviewThread[]> => {
	const ids = threads.flatMap((thread) => [thread.id, ...thread.replies.map((reply) => reply.id)]);
	if (ids.length === 0) return threads;
	const found = await rows<{ messageId: string } & ReviewMessageDelivery>(
		tx,
		sql`SELECT thread_message_id AS "messageId", state, error FROM review_deliveries
		WHERE thread_message_id IN (${sql.join(
			ids.map((id) => sql`${id}`),
			sql`,`,
		)})`,
	);
	const byMessage = new Map<string, ReviewMessageDelivery>();
	for (const row of found) {
		const state = { state: row.state, error: row.error };
		const held = byMessage.get(row.messageId);
		byMessage.set(row.messageId, held ? worse(held, state) : state);
	}
	return threads.map((thread) => ({
		...thread,
		delivery: byMessage.get(thread.id) ?? null,
		replies: thread.replies.map((reply) => ({ ...reply, delivery: byMessage.get(reply.id) ?? null })),
	}));
};
