import { sql } from "drizzle-orm";
import type { Tx } from "../../../db/tx.ts";
import { sessionObserverByRun } from "../queries";

// Turns the observer off and ends the generation it had claimed. The saved
// messages, the cursor of the activity it already consumed, and the recorded
// error stay, so turning the observer on again resumes from where it stopped.
// `cancelGeneration` is true when a generation was in flight, which tells the
// caller to abort that in-process work after the transaction commits.
export type DisableSessionObserverResult = {
	observerRunId: string | null;
	cancelGeneration: boolean;
};

export const disableSessionObserver = async (
	tx: Tx,
	input: { runId: string; now: Date },
): Promise<DisableSessionObserverResult> => {
	const observer = await sessionObserverByRun(tx, { runId: input.runId, lock: true });
	if (observer === null) return { observerRunId: null, cancelGeneration: false };
	const cancelGeneration = observer.enabled && observer.generationState === "generating";
	await tx.execute(sql`UPDATE session_observers SET enabled=false, generation_state='idle',
		generation_claim_id=NULL, generation_cursor=NULL, updated_at=${input.now}
		WHERE run_id=${input.runId}`);
	return { observerRunId: observer.observerRunId, cancelGeneration };
};
