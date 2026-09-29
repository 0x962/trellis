import { sql } from "drizzle-orm";
import type { Tx } from "../../../db/tx.ts";
import { sessionObserverByRun } from "../queries";

export type DisableSessionObserverForDeletionResult = {
	observerRunId: string | null;
	cancelGeneration: boolean;
};

export const disableSessionObserverForDeletion = async (
	tx: Tx,
	input: { runId: string; now: Date },
): Promise<DisableSessionObserverForDeletionResult> => {
	const observer = await sessionObserverByRun(tx, { runId: input.runId, lock: true });
	if (observer === null) return { observerRunId: null, cancelGeneration: false };
	const cancelGeneration = observer.enabled && observer.generationState === "generating";
	await tx.execute(sql`UPDATE session_observers SET enabled=false, generation_state='idle',
		generation_claim_id=NULL, generation_cursor=NULL, updated_at=${input.now}
		WHERE run_id=${input.runId}`);
	return { observerRunId: observer.observerRunId, cancelGeneration };
};
