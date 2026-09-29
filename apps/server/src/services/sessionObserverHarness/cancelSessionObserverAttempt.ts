import { nativeClient } from "../../agents/native/connection.ts";
import { getRun } from "../agentRuns/queries.ts";
import type { IoCtx } from "../support.ts";
import { stopObserverAttempt } from "./stopObserverAttempt.ts";
import { ObserverHarnessError } from "./types.ts";

export async function cancelSessionObserverAttempt(
	ctx: Pick<IoCtx, "home" | "newTx">,
	input: { observerRunId: string; attemptId: string },
) {
	const run = await ctx.newTx((tx) => getRun(tx, input.observerRunId));
	if (run.terminalId !== input.attemptId)
		throw new ObserverHarnessError(
			"OBSERVER_CANCEL_UNCONFIRMED",
			"The observer has another attempt. Read its current identity before cancellation.",
		);
	await stopObserverAttempt(nativeClient(ctx.home), input.attemptId);
}
