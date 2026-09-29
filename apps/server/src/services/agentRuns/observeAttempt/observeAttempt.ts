import type { IoCtx } from "../../support";
import { recordAttemptObservation } from "./recordAttemptObservation";

export async function observeAttempt(
	ctx: Pick<IoCtx, "newTx">,
	input: { runId: string; attemptId: string; sessionId: string | null },
) {
	return ctx.newTx(async (tx) => {
		const run = await recordAttemptObservation(ctx, tx, input);
		return { matched: run !== null, error: run?.error ?? null };
	});
}
