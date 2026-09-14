import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";

export async function hasNativeReceipt(tx: Tx, attemptId: string, messageId: string) {
	return (
		(
			await rows<{ message_id: string }>(
				tx,
				sql`SELECT message_id FROM agent_harness_receipts WHERE attempt_id=${attemptId} AND message_id=${messageId}`,
			)
		).length > 0
	);
}
