import { eq } from "drizzle-orm";
import { langflowDocumentConversions } from "../../tables/langflowDocuments/index.ts";
import type { Tx } from "../../tx.ts";

export const readDocumentConversion = async (tx: Tx, input: { migrationId: string }) => {
	const [record] = await tx
		.select()
		.from(langflowDocumentConversions)
		.where(eq(langflowDocumentConversions.migrationId, input.migrationId));
	return record;
};
