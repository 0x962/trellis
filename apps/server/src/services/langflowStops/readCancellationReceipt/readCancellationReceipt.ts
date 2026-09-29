import { and, eq } from "drizzle-orm";
import type { ServiceCtx } from "../../../context";
import { lockExecution, readProjectionFacts } from "../../../db/queries/langflowExecution";
import { langflowOutbox } from "../../../db/tables/langflowExecution";
import { protocolDigest } from "../../../langflowContracts";
import type { Tx } from "../../../db/tx";
import { EngineCancellationReceiptSchema, EngineCancellationStatusSchema } from "../cancellationEngine";

export async function readCancellationReceipt(ctx: ServiceCtx, tx: Tx, input: { executionId: string }) {
	if (ctx.actor?.kind !== "system") throw new Error("authority_conflict");
	const execution = await lockExecution(tx, input);
	const [outbox] = await tx.select().from(langflowOutbox).where(and(
		eq(langflowOutbox.executionId, input.executionId), eq(langflowOutbox.kind, "cancel"),
		eq(langflowOutbox.id, execution.cancelIntent?.requestId ?? ""),
	));
	const acknowledgement = outbox?.receipt == null ? null : {
		receipt: EngineCancellationReceiptSchema.parse(outbox.receipt.receipt),
		engineStatus: EngineCancellationStatusSchema.parse(outbox.receipt.engineStatus),
	};
	if (acknowledgement && (acknowledgement.receipt.executionId !== execution.executionId ||
		acknowledgement.receipt.requestId !== execution.cancelIntent?.requestId ||
		acknowledgement.receipt.engineJobId !== execution.engineJobId ||
		acknowledgement.receipt.cancelIntentDigest !== protocolDigest(outbox!.payloadBytes)))
		throw new Error("cancellation_receipt_conflict");
	const facts = await readProjectionFacts(tx, input);
	return {
		intent: execution.cancelIntent,
		acknowledgement,
		stops: facts.stops,
		needsStop: facts.stops.some((stop) => stop.state !== "confirmed") ||
			facts.native.some((native) => !facts.stops.some((stop) => stop.attemptId === native.handle.attemptId && stop.state === "confirmed")),
	};
}
