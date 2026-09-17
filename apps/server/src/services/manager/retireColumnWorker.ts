import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../context.ts";
import type { Tx } from "../../db/tx.ts";

export async function retireColumnWorker(
	_ctx: ServiceCtx,
	tx: Tx,
	input: { ticketId: string; projectId: string; category: string },
) {
	await tx.execute(sql`INSERT INTO column_workers(ticket_id,run_id,retired)
  SELECT ${input.ticketId},r.id,true FROM agent_runs r
  WHERE r.ticket_id=${input.ticketId} AND r.runtime='native' AND r.kind IN ('builder','reviewer')
  AND NOT EXISTS (SELECT 1 FROM flow_execution_tasks f WHERE f.run_id=r.id)
  ORDER BY (r.closed_at IS NULL) DESC,r.created_at DESC,r.id DESC LIMIT 1
  ON CONFLICT(ticket_id) DO UPDATE SET retired=true`);
}
