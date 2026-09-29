import type { FlowExecutionCancelInput } from "@trellis/api";
import type { ServiceCtx } from "../../../context";
import type { Tx } from "../../../db/tx";
import { saveStopState } from "../../langflowProjection/saveStopState";
import { cancelExecution } from "../cancelExecution";

export async function cancelView(ctx: ServiceCtx, tx: Tx, input: FlowExecutionCancelInput) {
	await cancelExecution(ctx, tx, input);
	return saveStopState(ctx, tx, { executionId: input.id });
}
