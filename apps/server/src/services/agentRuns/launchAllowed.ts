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
  AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.id=r.project_id AND p.archived_at IS NOT NULL)
 ) AS allowed FROM agent_runs r WHERE r.id=${input.runId}`,
	);
	return run?.allowed === true;
}
