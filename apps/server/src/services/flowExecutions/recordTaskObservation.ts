import { sql } from "drizzle-orm";
import { advanceFlow } from "../../agents/nativeFlow/advanceFlow.ts";
import { describeTaskFailure } from "../../agents/nativeFlow/describeTaskFailure.ts";
import { parseFlowDecision } from "../../agents/nativeFlow/parseFlowDecision.ts";
import { taskKey } from "../../agents/nativeFlow/taskKey.ts";
import type { FlowEvent } from "../../agents/nativeFlow/types.ts";
import type { HarnessSnapshot } from "../../agents/nativeHarness/types.ts";
import type { ServiceCtx } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { readExecution } from "./queries.ts";
import { saveState } from "./saveState.ts";
export async function recordTaskObservation(
	ctx: ServiceCtx,
	tx: Tx,
	input: {
		id: string;
		key: string;
		attemptId: string;
		snapshot: HarnessSnapshot;
		attempt: { matched: boolean; error: string | null };
	},
) {
	const execution = await readExecution(tx, input.id, true);
	const [task] = await rows<{ run_id: string; attempt_id: string; result_id: string | null }>(
		tx,
		sql`SELECT run_id,attempt_id,result_id FROM flow_execution_tasks WHERE execution_id=${input.id} AND key=${input.key}`,
	);
	if (!task || task.attempt_id !== input.attemptId || task.result_id !== null) return false;
	const step = execution.state.steps.find((step) => taskKey(step) === input.key);
	if (!step || !["running", "unknown"].includes(step.state)) return false;
	const [run] = await rows<{ session_id: string | null }>(
		tx,
		sql`SELECT session_id FROM agent_runs WHERE id=${task.run_id} AND terminal_id=${input.attemptId} FOR SHARE`,
	);
	let event: FlowEvent | null = null;
	const snapshot = input.snapshot;
	const node = execution.doc.nodes.find((node) => node.id === step.nodeId)!;
	const unknown = (error: string): FlowEvent => ({ type: "unknown", key: input.key, error });
	if (!input.attempt.matched || !run || run.session_id !== snapshot.sessionId)
		event = unknown("The result does not belong to the current flow attempt");
	else if (snapshot.state === "failed")
		event = {
			type: "fail",
			key: input.key,
			error: describeTaskFailure(
				execution.doc,
				execution.state,
				step,
				input.attempt.error ?? snapshot.error ?? "The flow worker failed",
			),
		};
	else if (snapshot.state === "unknown")
		event = unknown(input.attempt.error ?? snapshot.error ?? "The flow worker needs attention");
	else if (snapshot.state === "idle") {
		if (!snapshot.resultId || snapshot.result === null || !snapshot.acknowledgedMessageIds.includes(input.attemptId))
			event = unknown("The assignment receipt or final result is not established");
		else {
			const decision =
				node.kind === "gate" || step.phase === "condition" ? parseFlowDecision(snapshot.result) : undefined;
			if (decision === null) event = unknown("The condition must return a complete YES or NO response");
			else {
				event = { type: "complete", key: input.key, output: snapshot.result, decision };
				await tx.execute(
					sql`UPDATE flow_execution_tasks SET result_id=${snapshot.resultId} WHERE execution_id=${input.id} AND key=${input.key}`,
				);
			}
		}
	}
	if (event === null) return false;
	return saveState(ctx, tx, execution, advanceFlow(execution.doc, execution.state, event, ctx.now.getTime()));
}
