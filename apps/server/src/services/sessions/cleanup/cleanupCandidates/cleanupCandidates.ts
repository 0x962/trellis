import { sql } from "drizzle-orm";
import { rows } from "../../../../db/queries/support.ts";
import type { Tx } from "../../../../db/tx.ts";

export const cleanupCandidates = (tx: Tx, input: { now: Date; minimumAgeMs: number }) =>
	rows<{ id: string; runId: string }>(
		tx,
		sql`
	SELECT s.id, s.run_id AS "runId" FROM sessions s JOIN agent_runs r ON r.id = s.run_id
	WHERE r.kind = 'session' AND r.ticket_id IS NULL AND r.pinned_at IS NULL
	AND EXTRACT(EPOCH FROM (${input.now}::timestamptz - GREATEST(s.updated_at, r.activity_at, r.closed_at, r.created_at))) * 1000 >= ${input.minimumAgeMs}
	ORDER BY s.id
`,
	);
