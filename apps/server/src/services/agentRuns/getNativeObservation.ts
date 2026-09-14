import { sql } from "drizzle-orm";
import type { HarnessSnapshot } from "../../agents/nativeHarness/types.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
export const getNativeObservation = async (tx: Tx, attemptId: string) => {
	const [row] = await rows<{ snapshot: HarnessSnapshot }>(
		tx,
		sql`SELECT snapshot FROM agent_harness_observations WHERE attempt_id=${attemptId}`,
	);
	return row?.snapshot ?? null;
};
