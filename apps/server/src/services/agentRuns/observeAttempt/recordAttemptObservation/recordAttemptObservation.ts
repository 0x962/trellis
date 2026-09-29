import { sql } from "drizzle-orm";
import { rows } from "../../../../db/queries/support";
import type { Tx } from "../../../../db/tx";

export async function recordAttemptObservation(
	_ctx: object,
	tx: Tx,
	input: { runId: string; attemptId: string; sessionId: string | null },
) {
	const [run] = await rows<{
		id: string;
		terminalId: string;
		sessionId: string | null;
		workspacePath: string | null;
		error: string | null;
	}>(
		tx,
		sql`UPDATE agent_runs SET session_id=COALESCE(session_id,${input.sessionId})
		WHERE id=${input.runId} AND terminal_id=${input.attemptId}
		AND (${input.sessionId}::text IS NULL OR session_id IS NULL OR session_id=${input.sessionId})
		RETURNING id,terminal_id AS "terminalId",session_id AS "sessionId",workspace_id AS "workspacePath",error`,
	);
	return run ?? null;
}
