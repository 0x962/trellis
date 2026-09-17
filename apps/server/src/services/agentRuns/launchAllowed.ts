import type { StatusAgentConfig } from "@trellis/api";
import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";

export async function launchAllowed(
	tx: Tx,
	input: {
		runId: string;
		terminalId: string;
		requiredStatusId?: string;
		requiredAgentConfig?: StatusAgentConfig;
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
  AND (${input.requiredStatusId === undefined} OR EXISTS (
   SELECT 1 FROM tickets t JOIN statuses s ON s.id=t.status_id
   JOIN column_workers w ON w.ticket_id=t.id
   WHERE t.id=r.ticket_id AND s.id=${input.requiredStatusId ?? null}
   AND s.agent_config=${JSON.stringify(input.requiredAgentConfig ?? null)}::jsonb
   AND w.run_id=r.id AND w.status_id=s.id AND NOT w.retired
  ))
 ) AS allowed FROM agent_runs r WHERE r.id=${input.runId}`,
	);
	return run?.allowed === true;
}
