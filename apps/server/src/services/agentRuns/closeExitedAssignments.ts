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
			AND NOT (kind='builder' AND EXISTS (SELECT 1 FROM tickets t JOIN statuses s ON s.id=t.status_id WHERE t.id=agent_runs.ticket_id AND s.category='started') AND NOT EXISTS (SELECT 1 FROM flow_execution_tasks task WHERE task.run_id=agent_runs.id))
			AND terminal_id IN (${sql.join(
				exited.map((session) => sql`${session.id}`),
				sql`, `,
			)})`,
		),
	);
	return sessions;
}
