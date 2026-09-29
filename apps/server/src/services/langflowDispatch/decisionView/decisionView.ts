import type { FlowExecutionDecisionInput } from "@trellis/api";
import type { ServiceCtx } from "../../../context";
import { readExecution } from "../../../db/queries/langflowExecution";
import type { Tx } from "../../../db/tx";
import { decide } from "../../flowExecutions/decide";
import { record } from "../../langflowDecisions";
import { getView } from "../getView";

export async function decisionView(ctx: ServiceCtx, tx: Tx, input: FlowExecutionDecisionInput) {
	if (await readExecution(tx, { executionId: input.id })) return record(ctx, tx, input);
	await decide(ctx, tx, input);
	return getView(ctx, tx, input);
}
