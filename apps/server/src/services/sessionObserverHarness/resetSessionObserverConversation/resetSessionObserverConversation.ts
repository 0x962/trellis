import { sessionOperation } from "../../../agents/sessionOperation/index.ts";
import type { Tx } from "../../../db/tx.ts";
import { resetObserverConversation } from "../../agentRuns/observerRuns/index.ts";
import { getRun } from "../../agentRuns/queries.ts";
import { disableSessionObserver, sessionObserverByRun } from "../../sessionObservers/index.ts";
import type { IoCtx } from "../../support.ts";
import { recoverSessionObserverAttempt } from "../recoverSessionObserverAttempt/index.ts";
import { ObserverHarnessError } from "../types.ts";

export type ResetSessionObserverConversationInput = {
	sourceRunId: string;
	observerRunId: string;
	expectedProviderSessionId: string;
	requestId: string;
};

export type SessionObserverReset = {
	providerSessionId: string;
	replayed: boolean;
	cancelGeneration: boolean;
};

// Refuses when the session has no observer, or when the hidden observer run
// of that observer is not the one the caller named. `lock` holds the observer
// row for the rest of the transaction, so a claim, a save, or a failure of
// the same observer waits for the reset.
const assertObserverRun = async (tx: Tx, input: ResetSessionObserverConversationInput, lock = false) => {
	const observer = await sessionObserverByRun(tx, { runId: input.sourceRunId, lock });
	if (observer === null || observer.observerRunId !== input.observerRunId)
		throw new ObserverHarnessError("OBSERVER_DISABLED", "This session has no observer with that hidden conversation.");
};

// Gives a failed observer an empty Claude conversation and turns it off. The
// person turns it on again, and the ordinary enable path opens that empty
// conversation through the same text-only launch every observer update uses.
//
// `sessionOperation` holds the observer run for the whole call, which is the
// same hold generateSessionObserverReply takes, so no update can start an
// attempt while this runs and none can run while an update does.
export async function resetSessionObserverConversation(
	ctx: IoCtx,
	input: ResetSessionObserverConversationInput,
	deps = { recover: recoverSessionObserverAttempt },
): Promise<SessionObserverReset> {
	return sessionOperation(ctx.home, input.observerRunId, async () => {
		// The attempt read here is the one `recover` stops below. The writing
		// transaction refuses when the run carries a different attempt by then.
		const expectedAttemptId = await ctx.newTx(async (tx) => {
			await assertObserverRun(tx, input);
			return (await getRun(tx, input.observerRunId)).terminalId;
		});
		await deps.recover(ctx, { observerRunId: input.observerRunId });
		return ctx.newTx(async (tx) => {
			await assertObserverRun(tx, input, true);
			const reset = await resetObserverConversation(ctx, tx, { ...input, expectedAttemptId });
			if (reset.replayed) return { ...reset, cancelGeneration: false };
			const disabled = await disableSessionObserver(tx, { runId: input.sourceRunId, now: ctx.now() });
			return { ...reset, cancelGeneration: disabled.cancelGeneration };
		});
	});
}
