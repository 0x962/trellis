import { and, eq } from "drizzle-orm";
import { langflowDocumentSaveReceipts } from "../../tables/langflowDocuments/index.ts";
import type { Tx } from "../../tx.ts";

export const readDocumentSaveReceipt = async (tx: Tx, input: { flowId: string; requestId: string }) => {
	const [row] = await tx
		.select()
		.from(langflowDocumentSaveReceipts)
		.where(
			and(
				eq(langflowDocumentSaveReceipts.flowId, input.flowId),
				eq(langflowDocumentSaveReceipts.requestId, input.requestId),
			),
		);
	return row;
};
