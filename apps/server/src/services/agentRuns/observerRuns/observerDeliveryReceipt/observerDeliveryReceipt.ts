import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { rows } from "../../../../db/queries/support.ts";
import type { Tx } from "../../../../db/tx.ts";
import { ObserverHarnessError, type SessionObserverReplyInput } from "../../../sessionObserverTypes/index.ts";

export type DeliveryReceipt = { attemptId: string; digest: string; providerSessionId: string; throughCursor: string };
export const inputDigest = (input: SessionObserverReplyInput) =>
	createHash("sha256")
		.update(JSON.stringify([input.instruction, input.userContext]))
		.digest("hex");
export const requestIdOf = (input: SessionObserverReplyInput) =>
	`observer:${input.observerId}:${input.claimId}:${input.deliveryId ?? input.claimId}`;

export async function observerDeliveryReceipt(
	tx: Tx,
	input: SessionObserverReplyInput,
): Promise<DeliveryReceipt | null> {
	const [exact] = await rows<{ target: DeliveryReceipt }>(
		tx,
		sql`SELECT target FROM agent_start_requests
		WHERE actor_kind='system' AND actor_name='session-observer' AND request_id=${requestIdOf(input)}`,
	);
	if (exact) {
		if (exact.target.digest !== inputDigest(input))
			throw new ObserverHarnessError(
				"OBSERVER_DELIVERY_UNKNOWN",
				"This observer delivery ID already has different context.",
			);
		return exact.target;
	}
	const [latest] = await rows<{ target: DeliveryReceipt }>(
		tx,
		sql`SELECT r.target FROM agent_start_requests r
		JOIN agent_execution_attempts a ON a.id=r.target->>'attemptId'
		JOIN agent_runs g ON g.id=r.run_id
		WHERE r.actor_kind='system' AND r.actor_name='session-observer' AND r.run_id=${input.observerRunId}
		AND r.target->>'digest'=${inputDigest(input)} AND r.target->>'throughCursor'=${input.throughCursor}
		AND r.target->>'providerSessionId'=g.session_id
		ORDER BY a.generation DESC LIMIT 1`,
	);
	return latest?.target ?? null;
}
