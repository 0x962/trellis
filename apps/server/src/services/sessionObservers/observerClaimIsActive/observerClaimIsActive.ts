import { sql } from "drizzle-orm";
import { rows } from "../../../db/queries/support.ts";
import type { Tx } from "../../../db/tx.ts";

export async function observerClaimIsActive(
	tx: Tx,
	input: {
		observerId: string;
		sourceRunId: string;
		observerRunId: string;
		throughCursor: string;
		claimId: string;
	},
) {
	const [observer] = await rows(
		tx,
		sql`SELECT observer_id FROM session_observers
		WHERE observer_id=${input.observerId} AND run_id=${input.sourceRunId}
		AND observer_run_id=${input.observerRunId} AND enabled
		AND generation_cursor=${input.throughCursor}
		AND generation_state='generating' AND generation_claim_id=${input.claimId} FOR UPDATE`,
	);
	return observer !== undefined;
}
