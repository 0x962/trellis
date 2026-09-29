import type { ServiceCtx } from "../../../context.ts";
import { lockExecution } from "../../../db/queries/langflowExecution";
import type { Tx } from "../../../db/tx.ts";
import { invalidInput } from "../../../errors.ts";

export async function assertExecutionNotCanceled(_ctx: ServiceCtx, tx: Tx, input: { executionId: string }) {
	const execution = await lockExecution(tx, input);
	if (execution.cancelIntent !== null) throw invalidInput("id", "This flow execution is canceled.");
	return execution;
}
