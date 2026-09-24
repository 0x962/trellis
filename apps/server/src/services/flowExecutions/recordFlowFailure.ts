import { settleFlow } from "../../agents/nativeFlow/settleFlow.ts";
import type { ServiceCtx } from "../../context.ts";
import type { Tx } from "../../db/tx.ts";
import { readExecution } from "./queries.ts";
import { saveState } from "./saveState.ts";
export async function recordFlowFailure(ctx: ServiceCtx, tx: Tx, input: { id: string; error: string }) {
	const execution = await readExecution(tx, input.id, true);
	if (["canceled", "succeeded"].includes(execution.state.status)) return;
	const state = structuredClone(execution.state);
	state.status = "failed";
	state.error = input.error;
	state.failureKind = "error";
	await saveState(ctx, tx, execution, settleFlow(execution.doc, state, ctx.now.getTime()));
}
