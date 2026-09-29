import type { FlowDocumentV1, FlowPublicationV1 } from "@trellis/api";

export function flowPublicationReceipt(document: FlowDocumentV1, receipt: FlowPublicationV1): FlowDocumentV1 {
	if (
		document.engine !== "langflow" ||
		receipt.flowId !== document.flow.id ||
		receipt.revision !== document.revision ||
		receipt.documentHash !== document.documentHash ||
		receipt.componentManifestHash !== document.componentManifestHash ||
		document.publication.state === "published"
	)
		return document;
	return {
		...document,
		publication: { state: "published", revision: document.revision, publication: receipt },
		lastExecutablePublication: receipt,
	};
}
