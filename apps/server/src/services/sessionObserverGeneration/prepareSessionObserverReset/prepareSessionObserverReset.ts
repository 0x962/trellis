import { type SessionObserverResetInput, SessionObserverResetInputSchema } from "@trellis/api";
import { fail, invalidInput } from "../../../errors.ts";
import {
	ObserverHarnessError,
	recoverSessionObserverAttempt,
	resetSessionObserverConversation,
} from "../../sessionObserverHarness/index.ts";
import { resolveSessionUpdateOwner } from "../../sessionUpdates";
import type { IoCtx } from "../../support.ts";

export type PreparedSessionObserverReset = { runId: string; cancelGeneration: boolean };

// The harness states a failure with its own code. These are the ones a person
// can act on: restore the runtime so the attempt can stop, or read the
// observer again and send the identities it reports now.
const reported = (error: unknown) => {
	if (!(error instanceof ObserverHarnessError)) return error;
	if (error.code === "OBSERVER_CANCEL_UNCONFIRMED")
		return fail("RUNNER_UNAVAILABLE", { reason: "error" }, error.message);
	if (error.code === "OBSERVER_CONVERSATION_LOST") return invalidInput("expectedProviderSessionId", error.message);
	if (error.code === "OBSERVER_DISABLED") return invalidInput("expectedObserverRunId", error.message);
	return error;
};

// Runs before the answering transaction opens, because it stops a runtime
// attempt and writes through transactions of its own.
export const prepareSessionObserverReset = async (
	ctx: IoCtx,
	value: SessionObserverResetInput,
	deps = { recover: recoverSessionObserverAttempt },
): Promise<PreparedSessionObserverReset> => {
	const input = SessionObserverResetInputSchema.parse(value);
	if (ctx.actor.kind !== "human") throw fail("SESSION_OBSERVER_FORBIDDEN");
	const owner = await ctx.newTx((tx) => resolveSessionUpdateOwner(tx, input.sessionId));
	if (owner.runId !== input.expectedRunId)
		throw invalidInput("expectedRunId", "This session belongs to another run. Read the session again.");
	const reset = await resetSessionObserverConversation(
		ctx,
		{
			sourceRunId: owner.runId,
			observerRunId: input.expectedObserverRunId,
			expectedProviderSessionId: input.expectedProviderSessionId,
			requestId: input.requestId,
		},
		deps,
	).catch((error: unknown) => {
		throw reported(error);
	});
	return { runId: owner.runId, cancelGeneration: reset.cancelGeneration };
};
