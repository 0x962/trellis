import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../../context.ts";
import { rows } from "../../../db/queries/support.ts";
import type { Tx } from "../../../db/tx.ts";

export type RecoveredSessionObserverGeneration = {
	runId: string;
	observerRunId: string | null;
};

export const recoverSessionObserverGenerations = async (
	ctx: ServiceCtx,
	tx: Tx,
): Promise<RecoveredSessionObserverGeneration[]> =>
	rows<RecoveredSessionObserverGeneration>(
		tx,
		sql`UPDATE session_observers SET generation_state='idle', generation_claim_id=NULL,
		generation_cursor=NULL, updated_at=${ctx.now} WHERE generation_state='generating'
		RETURNING run_id AS "runId", observer_run_id AS "observerRunId"`,
	);
