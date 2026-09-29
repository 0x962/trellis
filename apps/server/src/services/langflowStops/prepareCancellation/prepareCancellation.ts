import { isDeepStrictEqual } from "node:util";
import { and, eq } from "drizzle-orm";
import type { ServiceCtx } from "../../../context";
import { lockExecution } from "../../../db/queries/langflowExecution";
import { langflowOutbox } from "../../../db/tables/langflowExecution";
import type { Tx } from "../../../db/tx";
import { terminalCancellationStatuses, EngineCancellationReceiptSchema, EngineCancellationStatusSchema } from "../cancellationEngine";
import { CancelIntentV1Schema, protocolDigest } from "../../../langflowContracts";

export async function prepareCancellation(ctx: ServiceCtx, tx: Tx, input: { executionId: string }) {
	if (ctx.actor?.kind !== "system") throw new Error("authority_conflict");
	const execution = await lockExecution(tx, input);
	if (execution.cancelIntent === null) return { state: "absent" as const };
	const [pending] = await tx.select().from(langflowOutbox).where(and(
		eq(langflowOutbox.executionId, input.executionId),
		eq(langflowOutbox.kind, "cancel"),
		eq(langflowOutbox.id, execution.cancelIntent.requestId),
	));
	if (!pending) throw new Error("cancellation_outbox_missing");

	if (!isDeepStrictEqual(CancelIntentV1Schema.parse(JSON.parse(pending.payloadBytes)), execution.cancelIntent))
		throw new Error("cancellation_outbox_conflict");
	const request = {
		executionId: execution.executionId, publicationId: execution.publicationId,
		engineJobId: execution.engineJobId, requestId: execution.cancelIntent.requestId, cancelIntentBytes: pending.payloadBytes,
	};
	if (request.engineJobId === null) return { state: "authority_required" as const };
	const boundRequest = { ...request, engineJobId: request.engineJobId };
	if (pending.receipt !== null) {
		const acknowledgement = { receipt: EngineCancellationReceiptSchema.parse(pending.receipt.receipt),
			engineStatus: EngineCancellationStatusSchema.parse(pending.receipt.engineStatus) };
		if (acknowledgement.receipt.executionId !== execution.executionId ||
			acknowledgement.receipt.requestId !== execution.cancelIntent.requestId ||
			acknowledgement.receipt.engineJobId !== execution.engineJobId ||
			acknowledgement.receipt.cancelIntentDigest !== protocolDigest(pending.payloadBytes))
			throw new Error("cancellation_receipt_conflict");
		if (terminalCancellationStatuses.some((status) => status === acknowledgement.engineStatus))
			return { state: "confirmed" as const, request: boundRequest, acknowledgement };
	}
	const authority = execution.authority;
	if (
		!authority || !authority.permissions.includes("execution.cancel") ||
		Date.parse(authority.expiresAt) <= ctx.now.getTime()
	) return { state: "authority_required" as const };
	if (execution.admission.state !== "closed" || execution.engineJobId !== authority.engineJobId || authority.executionId !== execution.executionId ||
		authority.publicationId !== execution.publicationId || authority.hostId !== execution.hostId)
		throw new Error("cancellation_binding_conflict");
	return {
		state: "pending" as const,
		authority,
		request: boundRequest,
	};
}
