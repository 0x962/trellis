import { sql } from "drizzle-orm";
import { rows, textArray } from "../../db/queries/support.ts";
import type { ServiceCtx } from "../support.ts";
import { readRuntimeSessions } from "./liveState.ts";

// Closes every open manager, flow, and session run whose process exited,
// and returns the exited sessions of every open native run. The runtime
// read names the terminals of the open runs, so the reply stays small
// however many exited records the runtime retains.
export async function closeExitedAssignments(ctx: ServiceCtx, read = readRuntimeSessions) {
	const open = await ctx.newTx((tx) =>
		rows<{ terminal_id: string }>(
			tx,
			sql`SELECT terminal_id FROM agent_runs WHERE runtime = 'native' AND closed_at IS NULL AND terminal_id IS NOT NULL`,
		),
	);
	if (open.length === 0) return [];
	const exited = await read(ctx.home, { ids: open.map((run) => run.terminal_id), status: "exited" });
	if (exited.length === 0) return exited;
	await ctx.newTx((tx) =>
		tx.execute(
			sql`UPDATE agent_runs SET closed_at = ${ctx.now()} WHERE runtime = 'native' AND closed_at IS NULL
			AND kind <> 'agent'
			AND terminal_id = ANY(${textArray(exited.map((session) => session.id))})`,
		),
	);
	return exited;
}
