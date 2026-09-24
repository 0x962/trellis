import { sql } from "drizzle-orm";
import { rows, textArray } from "../../db/queries/support.ts";
import type { ServiceCtx } from "../support.ts";
import { readRuntimeSessions } from "./liveState.ts";

// A run that a ticket or a session holds keeps its assignment when its
// process ends, so a follow-up resumes the saved conversation. The ticket
// keeps its agent until a person unassigns it, and the session keeps its
// place in the session list until a person archives it. A flow run closes
// here, because a flow step ends with its process.
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
	// A harness bridge that stops sends the runtime an error event, and the
	// runtime keeps that text in the agent record of its session. The record
	// lives in the memory of the execution service, so the text goes into
	// `agent_runs.error` here. The session page then still names the reason
	// after a restart of that service.
	const reasons = exited.flatMap((session) =>
		session.agent?.error == null ? [] : [{ id: session.id, error: session.agent.error }],
	);
	await ctx.newTx(async (tx) => {
		for (const reason of reasons)
			await tx.execute(
				sql`UPDATE agent_runs SET error = ${reason.error}, updated_at = ${ctx.now()}
				WHERE runtime = 'native' AND terminal_id = ${reason.id} AND error IS NULL`,
			);
		await tx.execute(
			sql`UPDATE agent_runs SET closed_at = ${ctx.now()} WHERE runtime = 'native' AND closed_at IS NULL
			AND kind NOT IN ('agent', 'session')
			AND terminal_id = ANY(${textArray(exited.filter((session) => session.stopReason !== "idle").map((session) => session.id))})`,
		);
	});
	return exited;
}
