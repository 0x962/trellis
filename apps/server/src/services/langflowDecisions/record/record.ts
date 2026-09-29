import type { FlowExecutionDecisionInput } from "@trellis/api";
import type { ServiceCtx } from "../../../context.ts";
import { lockExecution, readCheckpoint, recordDecision } from "../../../db/queries/langflowExecution";
import type { Tx } from "../../../db/tx.ts";
import { invalidInput } from "../../../errors.ts";
import { getView, saveDecisionDelivery } from "../../langflowProjection";
import { createReceipt } from "../createReceipt";

export async function record(ctx: ServiceCtx, tx: Tx, input: FlowExecutionDecisionInput) {
	if (ctx.actor?.kind !== "human") throw invalidInput("actor", "A person must answer a human flow step.");
	const key = { executionId: input.id };
	const execution = await lockExecution(tx, key);
	if (execution.cancelIntent) throw invalidInput("id", "This execution has a cancellation request.");
	const view = await getView(ctx, tx, input);
	const checkpoint = await readCheckpoint(tx, key);
	if (!checkpoint) throw invalidInput("id", "The engine has not supplied the human wait. Refresh the execution.");
	const receipt = createReceipt(ctx, view, checkpoint, input);
	const saved = await recordDecision(tx, { payloadBytes: receipt.payloadBytes });
	return saveDecisionDelivery(ctx, tx, saved);
}
