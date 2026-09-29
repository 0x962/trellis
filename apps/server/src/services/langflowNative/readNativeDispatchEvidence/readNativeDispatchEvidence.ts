import { and, eq } from "drizzle-orm";
import { lockExecution } from "../../../db/queries/langflowExecution/executions";
import { langflowNativeHandles } from "../../../db/tables/langflowExecution";
import type { Tx } from "../../../db/tx";
import { protocolDigest } from "../../../langflowContracts";
import type { DispatchPermit } from "../../../langflowHost";

export async function readNativeDispatchEvidence(
	ctx: { dataHomeId: string },
	tx: Tx,
	input: { permit: DispatchPermit; receiptId?: string },
) {
	const { permit } = input;
	const { binding } = permit;
	if (permit.dataHomeId !== ctx.dataHomeId || binding.kind !== "native-dispatch" || !binding.executionId)
		throw new Error("native_permit_conflict");
	await lockExecution(tx, { executionId: binding.executionId });
	const [row] = await tx
		.select()
		.from(langflowNativeHandles)
		.where(
			and(
				eq(langflowNativeHandles.executionId, binding.executionId),
				eq(langflowNativeHandles.requestId, binding.requestId),
			),
		);
	if (!row) return null;
	if (
		row.requestDigest !== binding.payloadDigest ||
		protocolDigest(row.requestBytes) !== binding.payloadDigest ||
		row.provenance.request.engineJobId !== binding.jobId
	)
		throw new Error("native_permit_conflict");
	const reservation = binding.attemptId === null;
	const effectId = reservation
		? `native-reservation:${row.executionId}:${row.requestId}`
		: `native-launch:${row.stepId}:${row.attemptId}`;
	if (binding.effectId !== effectId || (!reservation && binding.attemptId !== row.attemptId))
		throw new Error("native_permit_conflict");
	if (!reservation && row.launchReceipt === null) return null;
	const receiptId = reservation ? row.stepId : row.launchReceipt!.launchReceiptId;
	if (input.receiptId !== undefined && input.receiptId !== receiptId)
		throw new Error("native_dispatch_receipt_conflict");
	if (!reservation && (row.launchReceipt!.stepId !== row.stepId || row.launchReceipt!.attemptId !== row.attemptId))
		throw new Error("native_dispatch_receipt_conflict");
	const sourceBytes = JSON.stringify({
		version: 1,
		kind: reservation ? "native-reservation" : "native-launch",
		executionId: row.executionId,
		taskKey: row.taskKey,
		requestBytes: row.requestBytes,
		requestDigest: row.requestDigest,
		provenance: row.provenance,
		launchReceipt: reservation ? null : row.launchReceipt,
	});
	return { receiptId, outcome: "completed" as const, sourceBytes, sourceDigest: protocolDigest(sourceBytes) };
}
