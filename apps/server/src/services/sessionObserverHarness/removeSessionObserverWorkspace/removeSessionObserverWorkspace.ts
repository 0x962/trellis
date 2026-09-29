import { rm } from "node:fs/promises";
import { join } from "node:path";
import { sessionOperation } from "../../../agents/sessionOperation/index.ts";
import { closeObserverRun } from "../../agentRuns/observerRuns/index.ts";
import { getRun } from "../../agentRuns/queries.ts";
import { disableSessionObserverForDeletion } from "../../sessionObservers/index.ts";
import type { IoCtx } from "../../support.ts";
import { recoverSessionObserverAttempt } from "../recoverSessionObserverAttempt/index.ts";

export async function removeSessionObserverWorkspace(
	ctx: IoCtx,
	input: { sourceRunId: string },
	deps = { recover: recoverSessionObserverAttempt, remove: rm },
) {
	const { observerRunId } = await ctx.newTx((tx) =>
		disableSessionObserverForDeletion(tx, { runId: input.sourceRunId, now: ctx.now() }),
	);
	if (!observerRunId) return;
	await deps.recover(ctx, { observerRunId });
	await sessionOperation(ctx.home, observerRunId, async () => {
		const run = await ctx.newTx((tx) => getRun(tx, observerRunId));
		const directory = join(ctx.home, "observers", observerRunId);
		if (run.workspaceId !== null && run.workspaceId !== directory)
			throw new Error("The observer workspace is outside its managed directory.");
		await deps.remove(directory, { recursive: true, force: true });
		await ctx.newTx((tx) => closeObserverRun(tx, { runId: observerRunId, attemptId: run.terminalId, now: ctx.now() }));
	});
}
