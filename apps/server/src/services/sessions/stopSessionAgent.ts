import { sql } from "drizzle-orm";
import { invalidInput } from "../../errors.ts";
import { stopNative } from "../agentRuns/nativeLifecycle.ts";
import type { StoredRun } from "../agentRuns/queries.ts";
import type { IoCtx } from "../support.ts";
import { sessionProcess } from "./process.ts";

// Ends the agent of a session and leaves its run closed. A run with
// `closed_at` set holds no assignment, so trellis starts no process for it
// until a person starts the session again.
//
// The runtime answers `null` for an attempt it holds no record of. An open
// run with an attempt the runtime cannot name may still hold a process that
// writes in the session directory, so the call stops and a person inspects
// the agent. A process that exited for `idle` keeps its runtime record, and
// the runtime removes that record when it stops the process.
//
// The workspace, its files, and the saved conversation stay as they are.
export const stopSessionAgent = async (
	ctx: IoCtx,
	run: StoredRun,
	deps = { process: sessionProcess, stop: stopNative },
) => {
	const previous = await deps.process(ctx, run.terminalId);
	if (previous === null && run.terminalId !== null && run.closedAt === null)
		throw invalidInput("id", "The prior launch is not confirmed. Inspect the agent first.");
	if (previous !== null && (previous.status !== "exited" || previous.stopReason === "idle")) await deps.stop(ctx, run);
	else if (run.closedAt === null)
		await ctx.newTx((tx) =>
			tx.execute(sql`UPDATE agent_runs SET closed_at = ${ctx.now()}, updated_at = ${ctx.now()} WHERE id = ${run.id}`),
		);
};
