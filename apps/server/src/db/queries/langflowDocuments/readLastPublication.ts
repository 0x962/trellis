import { desc, eq } from "drizzle-orm";
import { langflowDocumentPublications } from "../../tables/langflowDocuments/index.ts";
import type { Tx } from "../../tx.ts";

export const readLastDocumentPublication = async (tx: Tx, input: { flowId: string }) => {
	const [row] = await tx
		.select()
		.from(langflowDocumentPublications)
		.where(eq(langflowDocumentPublications.flowId, input.flowId))
		.orderBy(desc(langflowDocumentPublications.revision))
		.limit(1);
	return row?.publication;
};
