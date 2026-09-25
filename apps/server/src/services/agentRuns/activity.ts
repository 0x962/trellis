import { sql } from "drizzle-orm";
import type { RequestContext } from "../../context.ts";
import type { Tx } from "../../db/tx.ts";
import type { IoCtx } from "../support.ts";
import { observeRuns } from "./liveState.ts";
import { listColumns, type StoredRun, storedRows } from "./queries.ts";

export const activityRows = (tx: Tx) =>
	storedRows<StoredRun>(
		tx,
		sql`
		SELECT ${listColumns}
		FROM agent_runs WHERE kind <> 'flow' AND runtime='native' AND terminal_id IS NOT NULL AND
		(closed_at IS NULL OR kind = 'session') AND
		(ticket_identifier IS NOT NULL OR kind = 'session')`,
	);

export const activityRuns = async (ctx: IoCtx) => observeRuns(ctx, await ctx.newTx(activityRows));

export const recordObservedActivity = async (
	_ctx: RequestContext,
	tx: Tx,
	values: Array<{ id: string; activityAt: string }>,
) => {
	if (values.length === 0) return;
	await tx.execute(sql`UPDATE agent_runs AS run SET activity_at=observed.activity_at
		FROM (
			SELECT * FROM unnest(
				${sql.param(values.map((value) => value.id))}::text[],
				${sql.param(values.map((value) => value.activityAt))}::timestamptz[]
			) AS value(id, activity_at)
		) AS observed
		WHERE run.id=observed.id AND (run.activity_at IS NULL OR run.activity_at < observed.activity_at)`);
};
