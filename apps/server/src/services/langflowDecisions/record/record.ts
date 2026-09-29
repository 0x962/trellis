import type { FlowExecutionDecisionInput } from "@trellis/api";
import type { ServiceCtx } from "../../../context.ts";
import { lockExecution, readCheckpoint, readProjection, recordDecision } from "../../../db/queries/langflowExecution";
import type { Tx } from "../../../db/tx.ts";
import { invalidInput } from "../../../errors.ts";
import { createReceipt } from "../createReceipt";
import { saveDelivery } from "../saveDelivery/saveDelivery.ts";

export async function record(ctx: ServiceCtx, tx: Tx, input: FlowExecutionDecisionInput) {
	if (ctx.actor?.kind !== "human") throw invalidInput("actor", "A person must answer a human flow step.");
	const key = { executionId: input.id };
	const execution = await lockExecution(tx, key);
	if (execution.cancelIntent) throw invalidInput("id", "This execution has a cancellation request.");
	const projection = await readProjection(tx, key);
	const checkpoint = await readCheckpoint(tx, key);
	if (!projection || !checkpoint)
		throw invalidInput("id", "The engine has not supplied the human wait. Refresh the execution.");
	const receipt = createReceipt(ctx, projection.view, checkpoint, input);
	const saved = await recordDecision(tx, { payloadBytes: receipt.payloadBytes });
	return saveDelivery(ctx, tx, saved);
}
