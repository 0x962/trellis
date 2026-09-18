import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support.ts";
import type { ServiceCtx } from "../support.ts";
import { readRuntimeSessions } from "./liveState.ts";

export async function closeExitedAssignments(
	ctx: ServiceCtx,
	read = readRuntimeSessions,
	includeClosedManagers = false,
) {
	const runs = await ctx.newTx((tx) =>
		rows<{ terminalId: string }>(
			tx,
			sql`SELECT DISTINCT terminal_id AS "terminalId" FROM agent_runs
			WHERE runtime='native' AND terminal_id IS NOT NULL
			AND ((closed_at IS NULL AND kind<>'agent') OR (${includeClosedManagers} AND kind='manager'))`,
		),
	);
	if (runs.length === 0) return [];
	const sessions = await read(ctx.home, { ids: runs.map((run) => run.terminalId) });
	const exited = sessions.filter((session) => session.status === "exited");
	if (exited.length === 0) return sessions;
	await ctx.newTx((tx) =>
		tx.execute(
			sql`UPDATE agent_runs SET closed_at = ${ctx.now()} WHERE runtime = 'native' AND closed_at IS NULL
			AND kind <> 'agent'
			AND terminal_id IN (${sql.join(
				exited.map((session) => sql`${session.id}`),
				sql`, `,
			)})`,
		),
	);
	return sessions;
}
