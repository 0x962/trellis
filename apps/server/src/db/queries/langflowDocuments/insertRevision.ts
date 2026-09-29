import type { FlowDocumentSnapshotV1 } from "@trellis/api";
import { langflowDocumentPublicationStates, langflowDocumentRevisions } from "../../tables/langflowDocuments/index.ts";
import type { Tx } from "../../tx.ts";

// Historical imports keep their recorded metadata version. The source hash check
// rejects bytes that do not match the imported snapshot.
export const insertDocumentRevision = async (
	tx: Tx,
	input: {
		snapshot: FlowDocumentSnapshotV1;
		sourceBytes: Buffer;
		savedAt: Date;
	},
) => {
	const { snapshot } = input;
	await tx.insert(langflowDocumentRevisions).values({
		flowId: snapshot.flow.id,
		revision: snapshot.revision,
		documentHash: snapshot.documentHash,
		componentManifestHash: snapshot.componentManifestHash,
		...input,
	});
	await tx.insert(langflowDocumentPublicationStates).values({
		flowId: snapshot.flow.id,
		revision: snapshot.revision,
		version: 1,
		state: { state: snapshot.engine === "langflow" ? "pending" : "not_requested", revision: snapshot.revision },
	});
	return snapshot;
};
