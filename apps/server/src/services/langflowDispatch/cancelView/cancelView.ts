import type { FlowExecutionCancelInput } from "@trellis/api";
import type { ServiceCtx } from "../../../context";
import { readExecution } from "../../../db/queries/langflowExecution";
import type { Tx } from "../../../db/tx";
import { cancel } from "../../flowExecutions/cancel";
import { cancelView as cancelLangflow } from "../../langflowStops";
import { getView } from "../getView";

export async function cancelView(ctx: ServiceCtx, tx: Tx, input: FlowExecutionCancelInput) {
	if (await readExecution(tx, { executionId: input.id })) return cancelLangflow(ctx, tx, input);
	await cancel(ctx, tx, input);
	return getView(ctx, tx, input);
}
