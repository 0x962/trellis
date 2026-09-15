import type { RestartSession } from "@trellis/runtime-protocol/restart-plan";
import { sql } from "drizzle-orm";
import type { HarnessSnapshot } from "../../agents/nativeHarness/types.ts";
import type { ServiceCtx } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { recordTaskObservation } from "../flowExecutions/recordTaskObservation.ts";

export async function preserveCompletedFlow(
	ctx: ServiceCtx,
	tx: Tx,
	{ entry, snapshot }: { entry: RestartSession; snapshot: HarnessSnapshot | null },
) {
	if (
		snapshot?.state !== "idle" ||
		snapshot.result === null ||
		!snapshot.resultId ||
		snapshot.sessionId !== entry.providerSessionId ||
		!snapshot.acknowledgedMessageIds.includes(entry.previousAttemptId)
	)
		return;
	const tasks = await rows<{ execution_id: string; key: string }>(
		tx,
		sql`SELECT t.execution_id,t.key FROM flow_execution_tasks t
		JOIN agent_runs r ON r.id=t.run_id JOIN flow_executions e ON e.id=t.execution_id
		WHERE t.run_id=${entry.runId} AND t.attempt_id=${entry.previousAttemptId} AND t.result_id IS NULL
		AND r.closed_at IS NULL AND r.terminal_id=${entry.previousAttemptId} AND e.state->>'status' IN ('running','waiting')`,
	);
	for (const task of tasks)
		await recordTaskObservation(ctx, tx, {
			id: task.execution_id,
			key: task.key,
			attemptId: entry.previousAttemptId,
			snapshot,
		});
}
