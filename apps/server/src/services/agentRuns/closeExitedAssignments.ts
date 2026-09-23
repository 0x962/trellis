import { sql } from "drizzle-orm";
import { rows, textArray } from "../../db/queries/support.ts";
import type { ServiceCtx } from "../support.ts";
import { readRuntimeSessions } from "./liveState.ts";

// Idle expiry preserves assignments so a follow-up can resume the saved conversation.
// The runtime query selects only open runs to keep the response bounded.
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
			AND terminal_id = ANY(${textArray(exited.filter((session) => session.stopReason !== "idle").map((session) => session.id))})`,
		),
	);
	return exited;
}
