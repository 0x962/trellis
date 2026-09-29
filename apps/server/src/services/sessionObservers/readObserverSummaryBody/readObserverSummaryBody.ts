import { sql } from "drizzle-orm";
import { rows } from "../../../db/queries/support.ts";
import type { Tx } from "../../../db/tx.ts";

export async function readObserverSummaryBody(tx: Tx, input: { observerId: string; summaryMessageId: string }) {
	const [summary] = await rows<{ body: string }>(
		tx,
		sql`SELECT body FROM session_observer_messages
		WHERE id=${input.summaryMessageId} AND observer_id=${input.observerId} AND position=0 AND role='user'`,
	);
	return summary?.body;
}
