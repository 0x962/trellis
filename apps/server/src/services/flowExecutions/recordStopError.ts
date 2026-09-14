import { taskKey } from "../../agents/nativeFlow/taskKey.ts";
import type { ServiceCtx } from "../../context.ts";
import type { Tx } from "../../db/tx.ts";
import { readExecution } from "./queries.ts";
import { saveState } from "./saveState.ts";
export async function recordStopError(
	ctx: ServiceCtx,
	tx: Tx,
	input: { id: string; key: string; error: string | null },
) {
	const execution = await readExecution(tx, input.id, true);
	const state = structuredClone(execution.state);
	const step = state.steps.find((step) => taskKey(step) === input.key || step.key === input.key.split(":")[0]);
	if (!step) return;
	if (input.error !== null) {
		step.error = input.error;
		step.needsStop = true;
		state.error = input.error;
	} else if (step.needsStop) {
		if (state.error === step.error) state.error = null;
		step.error = null;
		step.needsStop = false;
	}
	await saveState(ctx, tx, execution, state);
}
