import { sql } from "drizzle-orm";
import { advanceFlow } from "../../agents/nativeFlow/advanceFlow.ts";
import type { ServiceCtx } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { readExecution } from "./queries.ts";
import { saveState } from "./saveState.ts";
// The host sent the worker of a step its `count`th time warning. The step
// keeps the count, so the next reconcile tick sends no repeat. A warning to
// a superseded attempt changes nothing.
export async function recordTimeWarning(
	ctx: ServiceCtx,
	tx: Tx,
	input: { id: string; key: string; attemptId: string; count: number },
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
			{ type: "warned", key: input.key, count: input.count },
			ctx.now.getTime(),
		),
	);
}
