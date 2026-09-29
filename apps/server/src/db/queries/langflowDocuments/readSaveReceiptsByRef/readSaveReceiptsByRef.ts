import { and, eq, sql } from "drizzle-orm";
import { langflowDocumentSaveReceipts } from "../../../tables/langflowDocuments";
import type { Tx } from "../../../tx.ts";

export const readDocumentSaveReceiptsByRef = (tx: Tx, input: { flow: string; requestId: string }) =>
	tx
		.select()
		.from(langflowDocumentSaveReceipts)
		.where(
			and(
				eq(langflowDocumentSaveReceipts.requestId, input.requestId),
				sql`convert_from(${langflowDocumentSaveReceipts.requestBytes}, 'UTF8')::jsonb ->> 'flow' = ${input.flow}`,
			),
		);
