import type { AgentActivity } from "@trellis/api";
import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import type { IoCtx } from "../support.ts";
import { observeRuns } from "./liveState.ts";
import { columns, type StoredRun } from "./queries.ts";

export const activityRows = (tx: Tx) =>
	rows<StoredRun & { activitySessionId: string | null }>(
		tx,
		sql`
		SELECT ${columns}, (SELECT id FROM sessions WHERE run_id=agent_runs.id) AS "activitySessionId"
		FROM agent_runs WHERE runtime='native' AND terminal_id IS NOT NULL AND
		(closed_at IS NULL OR id IN (SELECT run_id FROM sessions)) AND
		(ticket_identifier IS NOT NULL OR id IN (SELECT run_id FROM sessions))`,
	);

export const activity = async (ctx: IoCtx): Promise<AgentActivity[]> => {
	const entries = await ctx.newTx(activityRows);
	const runs = await observeRuns(
		ctx,
		entries.map(({ activitySessionId: _sessionId, ...run }) => run),
	);
	return runs.map((run, index) => ({ run, sessionId: entries[index]!.activitySessionId }));
};
