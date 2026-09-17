import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";

export async function launchAllowed(
	tx: Tx,
	input: {
		runId: string;
		terminalId: string;
	},
) {
	const [run] = await rows<{ allowed: boolean }>(
		tx,
		sql`SELECT (
  r.closed_at IS NULL AND r.terminal_id=${input.terminalId}
  AND NOT EXISTS (
   WITH RECURSIVE ancestors AS (
    SELECT id,parent_id,archived_at FROM projects WHERE id=r.project_id
    UNION ALL SELECT p.id,p.parent_id,p.archived_at FROM projects p JOIN ancestors a ON p.id=a.parent_id
   ) SELECT 1 FROM ancestors WHERE archived_at IS NOT NULL
  )
 ) AS allowed FROM agent_runs r WHERE r.id=${input.runId}`,
	);
	return run?.allowed === true;
}
