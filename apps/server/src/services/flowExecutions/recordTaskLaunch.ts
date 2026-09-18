import { sql } from "drizzle-orm";
import { advanceFlow } from "../../agents/nativeFlow/advanceFlow.ts";
import type { ServiceCtx } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { readExecution } from "./queries.ts";
import { saveState } from "./saveState.ts";
// The worker process of a step exists from `launchedAt`. The step counts its
// time from then, and each box around it with a time limit starts its clock
// then. A launch of a superseded attempt changes nothing.
export async function recordTaskLaunch(
	ctx: ServiceCtx,
	tx: Tx,
	input: { id: string; key: string; attemptId: string; launchedAt: number },
) {
	const execution = await readExecution(tx, input.id, true);
	const [task] = await rows<{ attempt_id: string }>(
		tx,
		sql`SELECT attempt_id FROM flow_execution_tasks WHERE execution_id=${input.id} AND key=${input.key}`,
	);
	if (!task || task.attempt_id !== input.attemptId) return false;
	return saveState(
		ctx,
		tx,
		execution,
		advanceFlow(
			execution.doc,
			execution.state,
			{ type: "launched", key: input.key, at: input.launchedAt },
			ctx.now.getTime(),
		),
	);
}
