import type { SessionObserver, SessionObserverError } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../../context.ts";
import type { Tx } from "../../../db/tx.ts";
import { readSessionObserver, sessionObserverByRun } from "../queries";

export const failSessionObserverGeneration = async (
	ctx: ServiceCtx,
	tx: Tx,
	input: { runId: string; claimId: string; error: SessionObserverError },
): Promise<SessionObserver | null> => {
	const observer = await sessionObserverByRun(tx, { runId: input.runId, lock: true });
	if (
		observer === null ||
		!observer.enabled ||
		observer.generationState !== "generating" ||
		observer.generationClaimId !== input.claimId
	)
		return null;
	await tx.execute(sql`UPDATE session_observers SET generation_state='idle', generation_claim_id=NULL,
		last_attempted_cursor=generation_cursor, generation_cursor=NULL, error_code=${input.error.code},
		error=${input.error.message}, updated_at=${ctx.now}
		WHERE run_id=${input.runId}`);
	return readSessionObserver(tx, input.runId);
};
