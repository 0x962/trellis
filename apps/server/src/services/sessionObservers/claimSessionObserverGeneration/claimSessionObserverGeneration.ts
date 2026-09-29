import type { SessionObserverMessage } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { Tx } from "../../../db/tx.ts";
import { sessionObserverByRun, sessionObserverMessages } from "../queries";

export type SessionObserverGenerationClaim = {
	observerId: string;
	runId: string;
	observerRunId: string | null;
	generation: number;
	claimId: string;
	fromCursor: string | null;
	throughCursor: string;
	messages: SessionObserverMessage[];
};

export const claimSessionObserverGeneration = async (
	tx: Tx,
	input: { runId: string; throughCursor: string },
): Promise<SessionObserverGenerationClaim | null> => {
	const observer = await sessionObserverByRun(tx, { runId: input.runId, lock: true });
	if (
		observer === null ||
		!observer.enabled ||
		observer.generationState === "generating" ||
		observer.lastConsumedCursor === input.throughCursor ||
		observer.lastAttemptedCursor === input.throughCursor
	)
		return null;
	const claimId = crypto.randomUUID();
	const generation = observer.generation + 1;
	await tx.execute(sql`UPDATE session_observers SET generation_state='generating', generation=${generation},
		generation_claim_id=${claimId}, generation_cursor=${input.throughCursor} WHERE run_id=${input.runId}`);
	return {
		observerId: observer.observerId,
		runId: observer.runId,
		observerRunId: observer.observerRunId,
		generation,
		claimId,
		fromCursor: observer.lastConsumedCursor,
		throughCursor: input.throughCursor,
		messages: await sessionObserverMessages(tx, { observerId: observer.observerId }),
	};
};
