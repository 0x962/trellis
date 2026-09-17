import type { Tx } from "../../db/tx.ts";
import { getRun } from "../agentRuns/queries.ts";
import { loopRuntimes } from "../loops/runtime.ts";
import type { IoCtx } from "../support.ts";

export async function reportLaunch(ctx: IoCtx, tx: Tx, input: { id: string }) {
	const run = await getRun(tx, input.id);
	if (run.error)
		loopRuntimes.get(ctx.home)?.record(`${run.ticketIdentifier ?? run.projectPath}: ${run.error}`, "error");
}
