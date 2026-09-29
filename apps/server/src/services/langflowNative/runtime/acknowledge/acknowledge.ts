import { and, eq } from "drizzle-orm";
import type { ServiceCtx } from "../../../../context";
import { confirmCompletion, lockExecution } from "../../../../db/queries/langflowExecution";
import { langflowCompletions } from "../../../../db/tables/langflowExecution";
import type { Tx } from "../../../../db/tx";
import { CompletionReceiptV1Schema } from "../../../../langflowContracts";
import { readReservation } from "../../readReservation";
import type { RuntimeAcknowledgeInput } from "../contracts";
import { readNativeWait } from "../waitBinding";

export async function runtimeAcknowledge(ctx: ServiceCtx, tx: Tx, input: RuntimeAcknowledgeInput) {
	if (ctx.actor?.kind !== "system") throw new Error("langflow_internal_native_required");
	const execution = await lockExecution(tx, input);
	if (execution.hostId !== input.hostId) throw new Error("native_host_conflict");
	const reservation = await readReservation(tx, input);
	if (reservation.requestBytes !== input.requestBytes) throw new Error("native_request_bytes_conflict");
	const wait = readNativeWait({ ...input, handle: reservation.handle });
	const receipt = CompletionReceiptV1Schema.parse(input.receipt);
	const [completion] = await tx
		.select()
		.from(langflowCompletions)
		.where(
			and(
				eq(langflowCompletions.completionId, receipt.completionId),
				eq(langflowCompletions.stepId, reservation.stepId),
			),
		);
	if (!completion) throw new Error("native_completion_receipt_conflict");
	if (receipt.executionId !== execution.executionId || receipt.engineWaitId !== wait.waitId)
		throw new Error("native_completion_receipt_conflict");
	await confirmCompletion(tx, { receipt });
	return null;
}
