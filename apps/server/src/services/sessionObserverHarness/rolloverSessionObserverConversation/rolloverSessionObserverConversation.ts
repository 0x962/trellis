import { sessionOperation } from "../../../agents/sessionOperation/index.ts";
import { replaceObserverConversation } from "../../agentRuns/observerRuns/index.ts";
import { readSessionObserverSummaryForClaim } from "../../sessionObservers/index.ts";
import type { IoCtx } from "../../support.ts";
import { recoverSessionObserverAttempt } from "../recoverSessionObserverAttempt/index.ts";
import { ObserverHarnessError } from "../types.ts";

export async function rolloverSessionObserverConversation(
	ctx: IoCtx,
	input: {
		sourceRunId: string;
		observerRunId: string;
		claimId: string;
		expectedProviderSessionId: string;
		summaryMessageId: string;
	},
	deps = { recover: recoverSessionObserverAttempt },
): Promise<{ providerSessionId: string }> {
	return sessionOperation(ctx.home, input.observerRunId, async () => {
		await deps.recover(ctx, { observerRunId: input.observerRunId });
		return ctx.newTx(async (tx) => {
			const summary = await readSessionObserverSummaryForClaim(tx, { ...input, runId: input.sourceRunId });
			if (!summary)
				throw new ObserverHarnessError(
					"OBSERVER_DISABLED",
					"Save the summary under the active observer claim before a new conversation.",
				);
			return replaceObserverConversation(ctx, tx, input);
		});
	});
}
