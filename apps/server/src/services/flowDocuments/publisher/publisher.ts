import type { FlowDiagnosticV1, FlowDocumentSnapshotV1, FlowPublicationV1 } from "@trellis/api";

export type SavedDocument = {
	snapshot: Extract<FlowDocumentSnapshotV1, { engine: "langflow" }>;
	sourceBytes: Buffer;
};

export type Publication = FlowPublicationV1;

// The installed engine validates component code, graph semantics, settings, deadlines,
// and instructions before it creates an immutable engine flow. The browser cannot supply this client.
export type DocumentPublisher = {
	enginePackageDigest: string;
	componentManifestHash: string;
	validate: (document: SavedDocument) => Promise<FlowDiagnosticV1[]>;
	publish: (document: SavedDocument) => Promise<Publication>;
	recover?: (document: SavedDocument) => Promise<Publication | null>;
};
