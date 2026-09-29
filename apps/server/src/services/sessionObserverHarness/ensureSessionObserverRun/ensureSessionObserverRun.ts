import { createObserverRun } from "../../agentRuns/observerRuns/index.ts";
import { lockEnabledObserver } from "../../sessionObservers/index.ts";
import type { IoCtx } from "../../support.ts";
import { ObserverHarnessError } from "../types.ts";

export async function ensureSessionObserverRun(
	ctx: IoCtx,
	input: {
		observerId: string;
		sourceRunId: string;
		modelId: string;
		accountId?: string;
	},
): Promise<{ observerRunId: string }> {
	return ctx.newTx(async (tx) => {
		if (!(await lockEnabledObserver(tx, input)) || input.observerId === input.sourceRunId)
			throw new ObserverHarnessError("OBSERVER_DISABLED", "The observer is no longer attached to this session.");
		return createObserverRun(ctx, tx, input);
	});
}
