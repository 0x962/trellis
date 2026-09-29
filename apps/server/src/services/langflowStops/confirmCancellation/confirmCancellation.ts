import { isDeepStrictEqual } from "node:util";
import { and, eq } from "drizzle-orm";
import type { ServiceCtx } from "../../../context";
import { lockExecution } from "../../../db/queries/langflowExecution";
import { langflowOutbox } from "../../../db/tables/langflowExecution";
import type { Tx } from "../../../db/tx";
import { protocolDigest } from "../../../langflowContracts";
import {
	type EngineCancellationReceipt,
	EngineCancellationReceiptSchema,
	type EngineCancellationStatus,
	EngineCancellationStatusSchema,
	terminalCancellationStatuses,
} from "../cancellationEngine";

export async function confirmCancellation(
	ctx: ServiceCtx,
	tx: Tx,
	input: { receipt: EngineCancellationReceipt; engineStatus: EngineCancellationStatus },
) {
	if (ctx.actor?.kind !== "system") throw new Error("authority_conflict");
	EngineCancellationReceiptSchema.parse(input.receipt);
	EngineCancellationStatusSchema.parse(input.engineStatus);
	const execution = await lockExecution(tx, input.receipt);
	const where = and(
		eq(langflowOutbox.kind, "cancel"),
		eq(langflowOutbox.id, input.receipt.requestId),
		eq(langflowOutbox.executionId, execution.executionId),
	);
	const [pending] = await tx.select().from(langflowOutbox).where(where);
	if (
		!pending ||
		execution.cancelIntent?.requestId !== input.receipt.requestId ||
		execution.engineJobId !== input.receipt.engineJobId ||
		protocolDigest(pending.payloadBytes) !== input.receipt.cancelIntentDigest
	)
		throw new Error("cancellation_receipt_conflict");
	if (pending.receipt !== null) {
		if (!isDeepStrictEqual(pending.receipt.receipt, input.receipt)) throw new Error("cancellation_receipt_conflict");
		if (terminalCancellationStatuses.some((status) => status === pending.receipt!.engineStatus)) return pending.receipt;
	}
	await tx.update(langflowOutbox).set({ receipt: input }).where(where);
	return input;
}
