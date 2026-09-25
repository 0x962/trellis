import type { AgentActivity } from "@trellis/api";
import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { nameSessionFromFirstExchange } from "../sessions/autoTitle.ts";
import type { IoCtx } from "../support.ts";
import { observeRuns } from "./liveState.ts";
import { listColumns, type StoredRun } from "./queries.ts";

export const activityRows = (tx: Tx) =>
	rows<StoredRun & { activitySessionId: string | null; activitySessionTitleState: string | null }>(
		tx,
		sql`
		SELECT ${listColumns},
			(SELECT id FROM sessions WHERE run_id=agent_runs.id) AS "activitySessionId",
			(SELECT title_state FROM sessions WHERE run_id=agent_runs.id) AS "activitySessionTitleState"
		FROM agent_runs WHERE kind <> 'flow' AND runtime='native' AND terminal_id IS NOT NULL AND
		(closed_at IS NULL OR id IN (SELECT run_id FROM sessions)) AND
		(ticket_identifier IS NOT NULL OR id IN (SELECT run_id FROM sessions))`,
	);

export const activity = async (ctx: IoCtx): Promise<AgentActivity[]> => {
	const entries = await ctx.newTx(activityRows);
	const runs = await observeRuns(
		ctx,
		entries.map(({ activitySessionId: _sessionId, activitySessionTitleState: _titleState, ...run }) => run),
	);
	for (const [index, run] of runs.entries()) {
		const session = entries[index]!;
		const sessionId = session.activitySessionId;
		const agentResponse = run.observation?.lastMessage?.text;
		if (
			sessionId !== null &&
			session.activitySessionTitleState === "temporary" &&
			run.observation?.outcome === "completed" &&
			agentResponse !== undefined
		)
			ctx.background((background) =>
				nameSessionFromFirstExchange(background, { sessionId, agentResponse }).then(() => undefined),
			);
	}
	return runs.map((run, index) => ({ run, sessionId: entries[index]!.activitySessionId }));
};
