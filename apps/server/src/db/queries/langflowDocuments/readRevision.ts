import { and, eq } from "drizzle-orm";
import { langflowDocumentRevisions } from "../../tables/langflowDocuments/index.ts";
import type { Tx } from "../../tx.ts";

export const readDocumentRevision = async (tx: Tx, input: { flowId: string; revision: number }) => {
	const [revision] = await tx
		.select()
		.from(langflowDocumentRevisions)
		.where(
			and(eq(langflowDocumentRevisions.flowId, input.flowId), eq(langflowDocumentRevisions.revision, input.revision)),
		);
	return revision;
};
