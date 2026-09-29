import type { FlowDiagnosticV1 } from "@trellis/api";
import type { DocumentConversionProvenance } from "../../../db/tables/langflowDocuments";

export type SourceRowManifest = {
	id: string;
	order: number;
	sha256: string;
	fields: Record<string, string>;
};

export type SourceManifestV1 = {
	flow: SourceRowManifest;
	briefingHash: string;
	nodes: SourceRowManifest[];
	edges: SourceRowManifest[];
	instructionHashes: Record<string, string>;
	entryNodeIds: string[];
};

export type MigrationRecordV1 = DocumentConversionProvenance & {
	schemaVersion: 1;
	migrationId: string;
	flowId: string;
	sourceVersion: number;
	sourceDocumentHash: string;
	sourceManifest: SourceManifestV1 | null;
	catalog?: { sha256: string; exportRef: string };
};

export type BlockedMigrationV1 = MigrationRecordV1 & {
	state: "blocked";
	targetDocumentHash: null;
};

export type SourceInspection = {
	manifest: SourceManifestV1 | null;
	diagnostics: FlowDiagnosticV1[];
};
