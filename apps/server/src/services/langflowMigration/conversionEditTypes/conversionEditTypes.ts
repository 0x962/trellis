import type { FlowDiagnosticV1, FlowDocumentContentV1, FlowDocumentSnapshotV1, FlowHarness } from "@trellis/api";
import type { ConversionExpansionV1 } from "../conversionIntakeTypes";
import type { EditedSourceV1 } from "../editedSource";

export type ConversionEditContent = Extract<FlowDocumentContentV1, { engine: "langflow" }>;
export type ConversionEditBase = Extract<FlowDocumentSnapshotV1, { engine: "langflow" }>;
export type PreparedConversionEditV1 = {
	state: "prepared";
	intentBytes: Buffer;
	base: { flowId: string; revision: number; documentHash: string; sourceBytesHash: string };
	enginePackageDigest: string;
	componentManifestHash: string;
	content: ConversionEditContent;
	sourceBytes: Buffer;
	metadata: { briefing: string; harness: FlowHarness | null };
	provenance: EditedSourceV1;
};
export type ConversionEditResultV1 =
	| { state: "blocked"; diagnostics: FlowDiagnosticV1[] }
	| PreparedConversionEditV1;

export type ConversionEditProducer = {
	enginePackageDigest: string;
	componentManifestHash: string;
	catalogBytes: Uint8Array;
	regenerate(input: {
		editedSourceBytes: Uint8Array;
		previousGraphDocument: ConversionEditBase["graphDocument"];
	}): Promise<{ state: "blocked"; diagnostics: FlowDiagnosticV1[] } | { state: "generated"; expansion: ConversionExpansionV1 }>;
	validate(input: { content: ConversionEditContent; sourceBytes: Buffer }): Promise<FlowDiagnosticV1[]>;
};
