import { sql } from "drizzle-orm";
import type { Tx } from "../../../db/tx.ts";
import type { SessionObserverGenerationClaim } from "../claimSessionObserverGeneration";
import { sessionObserverByRun, sessionObserverMessages } from "../queries";

export const linkSessionObserverRun = async (
	tx: Tx,
	input: { runId: string; claimId: string; observerRunId: string },
): Promise<SessionObserverGenerationClaim | null> => {
	const observer = await sessionObserverByRun(tx, { runId: input.runId, lock: true });
	if (
		observer === null ||
		!observer.enabled ||
		observer.generationState !== "generating" ||
		observer.generationClaimId !== input.claimId ||
		(observer.observerRunId !== null && observer.observerRunId !== input.observerRunId)
	)
		return null;
	if (observer.observerRunId === null)
		await tx.execute(
			sql`UPDATE session_observers SET observer_run_id=${input.observerRunId} WHERE run_id=${input.runId}`,
		);
	return {
		observerId: observer.observerId,
		runId: observer.runId,
		observerRunId: input.observerRunId,
		generation: observer.generation,
		claimId: observer.generationClaimId,
		fromCursor: observer.lastConsumedCursor,
		throughCursor: observer.generationCursor!,
		messages: await sessionObserverMessages(tx, { observerId: observer.observerId }),
	};
};
