import type { SessionObserver } from "@trellis/api";
import type { Tx } from "../../../db/tx.ts";
import { readSessionObserver } from "../../sessionObservers";
import type { IoCtx } from "../../support.ts";
import { cancelSessionObserverGeneration } from "../cancelSessionObserverGeneration.ts";
import type { PreparedSessionObserverReset } from "../prepareSessionObserverReset";

// prepareSessionObserverReset commits the new Claude conversation in
// transactions of its own, so this step only reads the observer the caller
// gets back. It also aborts the generation the reset ended, when one was
// still running in this process.
export const finishSessionObserverReset = async (
	ctx: IoCtx,
	tx: Tx,
	input: PreparedSessionObserverReset,
): Promise<SessionObserver> => {
	if (input.cancelGeneration) ctx.afterCommit(async () => cancelSessionObserverGeneration(ctx.core, input.runId));
	return readSessionObserver(tx, input.runId);
};
