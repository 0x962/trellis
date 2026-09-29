import { and, eq } from "drizzle-orm";
import { langflowDocumentPublications } from "../../tables/langflowDocuments/index.ts";
import type { Tx } from "../../tx.ts";

export const readDocumentPublication = async (tx: Tx, input: { flowId: string; revision: number }) => {
	const [row] = await tx
		.select()
		.from(langflowDocumentPublications)
		.where(
			and(
				eq(langflowDocumentPublications.flowId, input.flowId),
				eq(langflowDocumentPublications.revision, input.revision),
			),
		);
	return row?.publication;
};
