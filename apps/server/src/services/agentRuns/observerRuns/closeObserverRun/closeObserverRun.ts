import { sql } from "drizzle-orm";
import type { Tx } from "../../../../db/tx.ts";
export async function closeObserverRun(tx: Tx, input: { runId: string; attemptId: string | null; now: Date }) {
	await tx.execute(sql`UPDATE agent_runs SET workspace_id=NULL,closed_at=${input.now},updated_at=${input.now}
		WHERE id=${input.runId} AND terminal_id IS NOT DISTINCT FROM ${input.attemptId}`);
}
