import { createHash } from "node:crypto";
import type { FlowDiagnosticV1, FlowDocumentContentV1 } from "@trellis/api";
import { invalidInput } from "../../../errors";
import { inspectConversionGraph } from "../../langflowMigration";
import { createConversionValidator } from "../createConversionValidator";
import type { CapturedDocument, DocumentActionServices } from "../documentActionServices";
import { documentBytes } from "../documentBytes";
import type { DocumentPublisher } from "../publisher";

export type PreparedDocumentConversion = {
	state: "prepared";
	base: CapturedDocument;
	content: Extract<FlowDocumentContentV1, { engine: "langflow" }>;
	sourceBytes: Buffer;
	originalSourceBytes: Buffer;
	diagnostics: FlowDiagnosticV1[];
};

export type DocumentConversionPreparation = PreparedDocumentConversion | {
	state: "blocked";
	diagnostics: FlowDiagnosticV1[];
};

export const prepareDocumentConversion = async (
	base: CapturedDocument,
	publisher: DocumentPublisher,
	producer: Awaited<ReturnType<DocumentActionServices["conversion"]>>,
	savedAt: Date,
): Promise<DocumentConversionPreparation> => {
	if (base.snapshot.engine !== "legacy")
		throw invalidInput("flowId", "Convert an existing legacy document.");
	if (producer === null) return {
		state: "blocked",
		diagnostics: [{ code: "conversion_producer_unavailable", message: "The installed conversion producer is unavailable.", severity: "error", path: [] }],
	};
	const catalogBytes = Buffer.from(producer.catalogBytes);
	if (producer.enginePackageDigest !== publisher.enginePackageDigest ||
		producer.componentManifestHash !== publisher.componentManifestHash ||
		createHash("sha256").update(catalogBytes).digest("hex") !== publisher.componentManifestHash)
		throw invalidInput("componentManifestHash", "The compiler and publisher use different installed identities.");
	const originalSourceBytes = documentBytes({ flow: base.snapshot.flow, ...base.snapshot.graphDocument });
	const compiled = await producer.compile({ sourceBytes: Buffer.from(originalSourceBytes) });
	if (compiled.state === "blocked") return { state: "blocked", diagnostics: compiled.diagnostics };
	const inspected = inspectConversionGraph({
		sourceBytes: originalSourceBytes,
		catalogBytes,
		expansion: compiled.expansion,
	});
	if (inspected.graphDocument === null || inspected.diagnostics.some((item) => item.severity === "error"))
		return { state: "blocked", diagnostics: inspected.diagnostics };
	const content: PreparedDocumentConversion["content"] = {
		schemaVersion: 1,
		engine: "langflow",
		graphDocument: inspected.graphDocument,
		componentManifestHash: publisher.componentManifestHash,
	};
	const sourceBytes = documentBytes(content);
	const diagnostics = [
		...inspected.diagnostics,
		...await createConversionValidator(base.snapshot, publisher, savedAt)({ content, sourceBytes }),
	];
	if (diagnostics.some((item) => item.severity === "error")) return { state: "blocked", diagnostics };
	return { state: "prepared", base, content, sourceBytes, originalSourceBytes, diagnostics };
};
