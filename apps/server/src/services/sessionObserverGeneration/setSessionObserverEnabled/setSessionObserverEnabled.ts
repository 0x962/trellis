import type { SessionObserverSetEnabledInput } from "@trellis/api";
import type { Tx } from "../../../db/tx.ts";
import { setEnabled } from "../../sessionObservers";
import type { IoCtx } from "../../support.ts";
import { cancelSessionObserverGeneration } from "../cancelSessionObserverGeneration.ts";
import { requestSessionObserverGeneration } from "../requestSessionObserverGeneration";

export const setSessionObserverEnabled = async (ctx: IoCtx, tx: Tx, input: SessionObserverSetEnabledInput) => {
	const result = await setEnabled(ctx.core, tx, input);
	ctx.afterCommit(async () => {
		if (result.cancelGeneration) cancelSessionObserverGeneration(ctx.core, result.observer.runId);
		if (result.requestInitialGeneration) await requestSessionObserverGeneration(ctx, result.observer.runId);
	});
	return result.observer;
};
