import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import type { IoCtx } from "../support.ts";
import { observeRuns } from "./liveState.ts";
import { listColumns, type StoredRun } from "./queries.ts";

export const activityRows = (tx: Tx) =>
	rows<StoredRun>(
		tx,
		sql`
		SELECT ${listColumns}
		FROM agent_runs WHERE kind <> 'flow' AND runtime='native' AND terminal_id IS NOT NULL AND
		(closed_at IS NULL OR kind = 'session') AND
		(ticket_identifier IS NOT NULL OR kind = 'session')`,
	);

export const activityRuns = async (ctx: IoCtx) => observeRuns(ctx, await ctx.newTx(activityRows));
