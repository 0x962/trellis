import { desc, eq } from "drizzle-orm";
import { langflowDocumentRevisions } from "../../tables/langflowDocuments/index.ts";
import type { Tx } from "../../tx.ts";

export const readLatestDocumentRevision = async (tx: Tx, input: { flowId: string }) => {
	const [row] = await tx
		.select()
		.from(langflowDocumentRevisions)
		.where(eq(langflowDocumentRevisions.flowId, input.flowId))
		.orderBy(desc(langflowDocumentRevisions.revision))
		.limit(1);
	return row;
};
