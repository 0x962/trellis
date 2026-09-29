import type { ServiceCtx } from "../../../context";
import { lockExecution } from "../../../db/queries/langflowExecution";
import type { Tx } from "../../../db/tx";
import { confirmCancellation } from "../confirmCancellation";
import { pendingStopExecutions } from "../pendingStopExecutions";
import { prepareCancellation } from "../prepareCancellation";
import { readCancellationReceipt } from "../readCancellationReceipt";
import { readNativeStops } from "../readNativeStops";
import { settleNativeStop } from "../settleNativeStop";

export type StopStateOperations = {
	pending: { input: { executionId?: string }; output: Awaited<ReturnType<typeof pendingStopExecutions>> };
	prepare: { input: { executionId: string }; output: Awaited<ReturnType<typeof prepareCancellation>> };
	confirm: { input: Parameters<typeof confirmCancellation>[2]; output: Awaited<ReturnType<typeof confirmCancellation>> };
	read: { input: { executionId: string }; output: Awaited<ReturnType<typeof readCancellationReceipt>> };
	stops: { input: { executionId: string }; output: Awaited<ReturnType<typeof readNativeStops>> };
	settle: { input: Parameters<typeof settleNativeStop>[2]; output: Awaited<ReturnType<typeof settleNativeStop>> };
};
export type StopStateInput = {
	[K in keyof StopStateOperations]: { operation: K; input: StopStateOperations[K]["input"]; hostId: string };
}[keyof StopStateOperations];
export type StopStateResult = StopStateOperations[keyof StopStateOperations]["output"];
export type StopStateCall = (input: StopStateInput) => Promise<StopStateResult>;

export async function stopState(ctx: ServiceCtx, tx: Tx, request: StopStateInput): Promise<StopStateResult> {
	if (ctx.actor?.kind !== "system") throw new Error("authority_conflict");
	if (request.operation === "pending") return pendingStopExecutions(ctx, tx, { ...request.input, hostId: request.hostId });
	const executionId = request.operation === "confirm" ? request.input.receipt.executionId
		: request.operation === "settle" ? request.input.obligation.executionId : request.input.executionId;
	const execution = await lockExecution(tx, { executionId });
	if (execution.hostId !== request.hostId) throw new Error("stop_host_conflict");
	switch (request.operation) {
		case "prepare": return prepareCancellation(ctx, tx, request.input);
		case "confirm": return confirmCancellation(ctx, tx, request.input);
		case "read": return readCancellationReceipt(ctx, tx, request.input);
		case "stops": return readNativeStops(ctx, tx, request.input);
		case "settle": return settleNativeStop(ctx, tx, request.input);
	}
}
