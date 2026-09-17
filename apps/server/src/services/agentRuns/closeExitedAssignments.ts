import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../support.ts";
import { readRuntimeSessions } from "./liveState.ts";

export async function closeExitedAssignments(ctx: ServiceCtx, read = readRuntimeSessions) {
	const sessions = await read(ctx.home);
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
