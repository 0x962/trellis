import { sql } from "drizzle-orm";
import { rows } from "../../../db/queries/support.ts";
import type { ServiceCtx } from "../../support.ts";
import { readRuntimeSessions } from "../liveState.ts";

export async function readRunningAssignments(ctx: ServiceCtx, read = readRuntimeSessions) {
	const runs = await ctx.newTx((tx) =>
		rows<{ terminalId: string }>(
			tx,
			sql`SELECT DISTINCT terminal_id AS "terminalId" FROM agent_runs
			WHERE runtime='native' AND closed_at IS NULL AND terminal_id IS NOT NULL`,
		),
	);
	if (runs.length === 0) return [];
	return read(ctx.home, { ids: runs.map((run) => run.terminalId), status: "running" });
}
