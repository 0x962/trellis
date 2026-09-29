import type { FlowDoc } from "@trellis/api";
import { documentBytes } from "../../flowDocuments";
import { applyConversionEdit } from "../applyConversionEdit";
import { ConversionEditIntentV1Schema } from "../conversionEditIntent";
import { ConversionEnvelopeSchema } from "../conversionIntakeTypes";
import { inspectSource } from "../inspectSource";
import { sourceDigest } from "../sourceDigest";

const retainedBytes = (value: { bytesBase64: string; sha256: string }) => {
	const bytes = Buffer.from(value.bytesBase64, "base64");
	if (bytes.toString("base64") !== value.bytesBase64 || sourceDigest(bytes) !== value.sha256) {
		throw new Error("conversion_source_bytes_conflict");
	}
	return bytes;
};

export const readConversionSource = (graphDocument: Record<string, unknown>) => {
	const envelope = ConversionEnvelopeSchema.parse(graphDocument.trellisConversionV1);
	const originalBytes = retainedBytes(envelope.source);
	const original: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(originalBytes));
	const inspection = inspectSource(original);
	if (inspection.manifest === null || inspection.diagnostics.length > 0) throw new Error("conversion_source_invalid");
	const originalSource = original as FlowDoc;
	if (originalSource.flow.id !== envelope.source.flowId || originalSource.flow.version !== envelope.source.version) {
		throw new Error("conversion_source_identity_conflict");
	}
	let source = originalSource;
	let sourceBytes = originalBytes;
	let revision = originalSource.flow.version;
	const seen = new Set<string>();
	const history = envelope.editHistory ?? [];
	if (history.length > 0 && envelope.editedSource === undefined) throw new Error("conversion_edit_history_incomplete");
	for (const edit of [...history, ...(envelope.editedSource ? [envelope.editedSource] : [])]) {
		const intentBytes = retainedBytes(edit.intent);
		const intent = ConversionEditIntentV1Schema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(intentBytes)));
		if (intent.requestId !== edit.intent.requestId || seen.has(intent.requestId) ||
			intent.flowId !== envelope.source.flowId || intent.expectedVersion !== edit.derivedFrom.revision ||
			intent.expectedDocumentHash !== edit.derivedFrom.documentHash ||
			edit.derivedFrom.sourceHash !== sourceDigest(sourceBytes) ||
			edit.revision !== edit.derivedFrom.revision + 1 || edit.derivedFrom.revision < revision) {
			throw new Error("conversion_edit_chain_conflict");
		}
		seen.add(intent.requestId);
		const nextSource = applyConversionEdit(source, intent);
		const nextBytes = retainedBytes(edit);
		if (!documentBytes(nextSource).equals(nextBytes)) throw new Error("conversion_edit_result_conflict");
		source = nextSource;
		sourceBytes = nextBytes;
		revision = edit.revision;
	}
	return { envelope, originalSource, originalBytes, source, sourceBytes };
};
