import { sql } from "drizzle-orm";
import { upsert } from "../actors.ts";
import { stopNative } from "../agentRuns/nativeLifecycle.ts";
import { getRun } from "../agentRuns/queries.ts";
import type { IoCtx } from "../support.ts";
import { removeSessionDirectory } from "./directory.ts";
import { sessionProcess } from "./process.ts";
import { getSession } from "./queries.ts";

// Stops the agent when its process still lives, deletes the row, and
// removes the directory. The run stays as history with its retained
// output.
export const prepareDelete = async (ctx: IoCtx, input: { id: string }) => {
	const session = await ctx.newTx((tx) => getSession(tx, input.id));
	const run = await ctx.newTx((tx) => getRun(tx, session.runId));
	const previous = await sessionProcess(ctx, run.terminalId);
	if (previous !== null && previous.status !== "exited") await stopNative(ctx, run);
	else if (run.closedAt === null)
		await ctx.newTx((tx) =>
			tx.execute(sql`UPDATE agent_runs SET closed_at = ${ctx.now()}, updated_at = ${ctx.now()} WHERE id = ${run.id}`),
		);
	await ctx.newTx(async (tx) => {
		await upsert(ctx.core, tx, ctx.actor);
		await tx.execute(sql`DELETE FROM sessions WHERE id = ${session.id}`);
	});
	await removeSessionDirectory(ctx.home, session.directory);
	ctx.emit({ type: "sessions.changed", id: session.id });
	ctx.emit({ type: "agent-runs.changed", id: run.id });
	return { id: session.id };
};
