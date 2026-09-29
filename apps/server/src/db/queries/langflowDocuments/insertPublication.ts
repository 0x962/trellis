import type { FlowPublicationV1 } from "@trellis/api";
import { and, eq } from "drizzle-orm";
import { langflowDocumentPublications, langflowDocumentRevisions } from "../../tables/langflowDocuments/index.ts";
import type { Tx } from "../../tx.ts";

// The composite foreign key binds the engine receipt to one exact saved document.
// A second publication for that revision fails without replacing the first receipt.
export const insertDocumentPublication = async (tx: Tx, input: FlowPublicationV1) => {
	await tx
		.select({ revision: langflowDocumentRevisions.revision })
		.from(langflowDocumentRevisions)
		.where(
			and(eq(langflowDocumentRevisions.flowId, input.flowId), eq(langflowDocumentRevisions.revision, input.revision)),
		)
		.for("update");
	await tx.insert(langflowDocumentPublications).values({
		publicationId: input.publicationId,
		flowId: input.flowId,
		revision: input.revision,
		documentHash: input.documentHash,
		componentManifestHash: input.componentManifestHash,
		publication: input,
	});
	return input;
};
