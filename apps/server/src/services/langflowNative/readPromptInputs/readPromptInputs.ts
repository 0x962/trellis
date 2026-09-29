import { z } from "zod";
import { type NativeRequestV1, protocolDigest } from "../../../langflowContracts";

export type NativePromptReceipt = { receiptId: string; receiptBytes: string; receiptDigest: string };

const ReceiptSchema = z.strictObject({
	version: z.literal(1),
	receiptId: z.string().min(1),
	executionId: z.string().min(1),
	publicationId: z.string().min(1),
	engineJobId: z.string().min(1),
	nodeId: z.string().min(1),
	occurrenceKey: z.string().min(1),
	output: z.string(),
});

export function readPromptInputs(request: NativeRequestV1, receipts: NativePromptReceipt[]) {
	if (receipts.length !== request.inputReceiptIds.length) throw new Error("native_prompt_inputs_missing");
	return receipts.map((saved, index) => {
		if (saved.receiptId !== request.inputReceiptIds[index] || protocolDigest(saved.receiptBytes) !== saved.receiptDigest)
			throw new Error("native_prompt_receipt_conflict");
		const receipt = ReceiptSchema.parse(JSON.parse(saved.receiptBytes));
		if (
			receipt.receiptId !== saved.receiptId ||
			receipt.executionId !== request.executionId ||
			receipt.publicationId !== request.publicationId ||
			receipt.engineJobId !== request.engineJobId
		)
			throw new Error("native_prompt_receipt_conflict");
		return { key: receipt.occurrenceKey, nodeId: receipt.nodeId, output: receipt.output };
	});
}
