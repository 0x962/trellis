import type { FlowDiagnosticV1 } from "@trellis/api";
import { documentBytes } from "../../flowDocuments";
import { applyConversionEdit } from "../applyConversionEdit";
import { ConversionEditIntentV1Schema } from "../conversionEditIntent";
import type { ConversionEditBase, ConversionEditContent, ConversionEditProducer, ConversionEditResultV1 } from "../conversionEditTypes";
import type { EditedSourceV1 } from "../editedSource";
import { inspectConversionGraph } from "../inspectConversionGraph";
import { readConversionSource } from "../readConversionSource";
import { sourceDigest } from "../sourceDigest";

const blocked = (code: string, message: string): ConversionEditResultV1 => ({
	state: "blocked",
	diagnostics: [{ code, message, severity: "error", path: [] }],
});

export const prepareConversionEdit = async (
	input: { base: ConversionEditBase; requestBytes: Uint8Array },
	producer: ConversionEditProducer | null,
): Promise<ConversionEditResultV1> => {
	const base = structuredClone(input.base);
	const intentBytes = Buffer.from(input.requestBytes);
	const intent = ConversionEditIntentV1Schema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(intentBytes)));
	if (intent.flowId !== base.flow.id || intent.expectedVersion !== base.revision ||
		intent.expectedDocumentHash !== base.documentHash || intent.componentManifestHash !== base.componentManifestHash) {
		return blocked("conversion_edit_base_conflict", "The edit does not identify the captured saved document.");
	}
	const retained = readConversionSource(base.graphDocument);
	if (retained.envelope.source.flowId !== base.flow.id ||
		retained.envelope.componentManifestHash !== base.componentManifestHash ||
		(retained.envelope.editedSource && retained.envelope.editedSource.revision > base.revision)) {
		return blocked("conversion_edit_provenance_conflict", "The saved provenance does not identify the captured document.");
	}
	const edited = applyConversionEdit(retained.source, intent);
	const editedSourceBytes = documentBytes(edited);
	if (producer === null) return blocked("conversion_regeneration_unavailable", "The installed conversion producer is unavailable.");
	const catalogBytes = Buffer.from(producer.catalogBytes);
	if (producer.enginePackageDigest !== intent.enginePackageDigest ||
		producer.componentManifestHash !== intent.componentManifestHash ||
		sourceDigest(catalogBytes) !== intent.componentManifestHash) {
		return blocked("conversion_edit_engine_conflict", "The producer does not match the expected installed package and catalog.");
	}
	const regenerated = await producer.regenerate({
		editedSourceBytes,
		previousGraphDocument: structuredClone(base.graphDocument),
	});
	if (regenerated.state === "blocked") return regenerated;
	const inspected = inspectConversionGraph({ sourceBytes: editedSourceBytes, catalogBytes, expansion: regenerated.expansion });
	if (inspected.graphDocument === null || inspected.diagnostics.some((item) => item.severity === "error")) {
		return { state: "blocked", diagnostics: inspected.diagnostics };
	}
	const provenance: EditedSourceV1 = {
		schemaVersion: 1,
		revision: base.revision + 1,
		sha256: sourceDigest(editedSourceBytes),
		bytesBase64: editedSourceBytes.toString("base64"),
		derivedFrom: { revision: base.revision, documentHash: base.documentHash, sourceHash: sourceDigest(retained.sourceBytes) },
		intent: { requestId: intent.requestId, sha256: sourceDigest(intentBytes), bytesBase64: intentBytes.toString("base64") },
	};
	const graphDocument = {
		...inspected.graphDocument,
		trellisConversionV1: {
			...inspected.graphDocument.trellisConversionV1,
			source: retained.envelope.source,
			editHistory: [...(retained.envelope.editHistory ?? []), ...(retained.envelope.editedSource ? [retained.envelope.editedSource] : [])],
			editedSource: provenance,
		},
	};
	readConversionSource(graphDocument);
	const content: ConversionEditContent = {
		schemaVersion: 1, engine: "langflow", graphDocument, componentManifestHash: intent.componentManifestHash,
	};
	const sourceBytes = documentBytes(content);
	const diagnostics: FlowDiagnosticV1[] = [
		...inspected.diagnostics,
		...await producer.validate({ content, sourceBytes }),
	];
	if (diagnostics.some((item) => item.severity === "error")) return { state: "blocked", diagnostics };
	return {
		state: "prepared", intentBytes,
		base: { flowId: base.flow.id, revision: base.revision, documentHash: base.documentHash, sourceBytesHash: sourceDigest(documentBytes(base)) },
		enginePackageDigest: intent.enginePackageDigest,
		componentManifestHash: intent.componentManifestHash,
		content, sourceBytes,
		metadata: { briefing: edited.flow.briefing, harness: edited.flow.harness },
		provenance,
	};
};
