import { isDeepStrictEqual } from "node:util";
import { classificationStore } from "../../../db/queries/langflowExecution/classification";
import { lockExecution } from "../../../db/queries/langflowExecution/executions";
import { protocolDigest } from "../../../langflowContracts";
import type { DispatchEffects, DispatchPermit, DispatchReceiptArchive, TerminalReceipt } from "../../../langflowHost";
import type { IoCtx } from "../../support";

export async function settleReviewClassification(
	ctx: Pick<IoCtx, "newTx">,
	control: { gate: DispatchEffects; archive: DispatchReceiptArchive },
	input: { permit: DispatchPermit; receiptId: string },
): Promise<TerminalReceipt | null> {
	const { permit, receiptId } = input;
	const executionId = permit.binding.executionId;
	if (executionId === null) throw new Error("classification_permit_execution_missing");
	const current = control.gate.recoverPermit(permit.binding);
	if (current === null || !isDeepStrictEqual(current.permit, permit))
		throw new Error("classification_permit_conflict");
	const receipt = await ctx.newTx(async (tx) => {
		const execution = await lockExecution(tx, { executionId });
		const saved = await classificationStore.read(tx, { executionId });
		if (saved === null) return null;
		const binding = {
			executionId,
			publicationId: execution.publicationId,
			diffId: execution.diffId,
			reviewedHead: execution.reviewedHead,
		};
		const effect = {
			effectId: JSON.stringify(["review-classification", executionId, receiptId]),
			kind: "review-classification",
			executionId,
			attemptId: null,
			jobId: execution.engineJobId,
			requestId: receiptId,
			payloadDigest: protocolDigest(saved.requestBytes),
		};
		if (
			saved.receiptId !== receiptId ||
			execution.engineJobId === null ||
			!isDeepStrictEqual(saved.binding, binding) ||
			!isDeepStrictEqual(permit.binding, effect)
		)
			throw new Error("classification_receipt_conflict");
		return saved.state === "claimed" ? null : saved;
	});
	if (receipt === null) return null;
	const sourceBytes = JSON.stringify({ version: 1, classification: receipt });
	const terminal = control.archive.writeTerminal({
		permit,
		outcome: "completed",
		sourceBytes,
		sourceDigest: protocolDigest(sourceBytes),
	});
	await control.gate.settle(permit, terminal.id);
	return terminal;
}
