import { rm } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { getRun } from "../agentRuns/queries.ts";
import { disableSessionObserverForDeletion } from "../sessionObservers/index.ts";
import { sessionOperation } from "../sessions/operation.ts";
import type { IoCtx } from "../support.ts";
import { recoverSessionObserverAttempt } from "./recoverSessionObserverAttempt.ts";

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
		await ctx.newTx((tx) =>
			tx.execute(sql`UPDATE agent_runs SET workspace_id=NULL,closed_at=${ctx.now()},updated_at=${ctx.now()}
			WHERE id=${observerRunId} AND terminal_id IS NOT DISTINCT FROM ${run.terminalId}`),
		);
	});
}
