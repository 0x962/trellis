import { sql } from "drizzle-orm";
import { rows } from "../../../db/queries/support.ts";
import type { Tx } from "../../../db/tx.ts";

export async function lockEnabledObserver(tx: Tx, input: { observerId: string; sourceRunId: string }) {
	const [observer] = await rows(
		tx,
		sql`SELECT observer_id FROM session_observers
		WHERE observer_id=${input.observerId} AND run_id=${input.sourceRunId} AND enabled FOR UPDATE`,
	);
	return observer !== undefined;
}
