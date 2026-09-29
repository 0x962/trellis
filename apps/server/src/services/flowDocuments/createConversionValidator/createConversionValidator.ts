import { createHash } from "node:crypto";
import type { FlowDocumentSnapshotV1 } from "@trellis/api";
import { invalidInput } from "../../../errors";
import type { ConversionEditProducer } from "../../langflowMigration";
import { readConversionSource } from "../../langflowMigration";
import { documentBytes } from "../documentBytes";
import type { DocumentPublisher } from "../publisher";

export const createConversionValidator = (
	base: FlowDocumentSnapshotV1,
	publisher: DocumentPublisher,
	savedAt: Date,
): ConversionEditProducer["validate"] => async ({ content, sourceBytes }) => {
	if (!sourceBytes.equals(documentBytes(content)) || content.componentManifestHash !== publisher.componentManifestHash)
		throw invalidInput("content", "The converted content does not match its bytes or installed catalog.");
	const retained = readConversionSource(content.graphDocument);
	if (retained.envelope.source.flowId !== base.flow.id)
		throw invalidInput("content", "The converted source belongs to another flow.");
	const revision = base.revision + 1;
	return publisher.validate({
		snapshot: {
			...content,
			flow: {
				...base.flow,
				briefing: retained.source.flow.briefing,
				harness: retained.source.flow.harness,
				version: revision,
				updatedAt: savedAt.toISOString(),
			},
			revision,
			documentHash: createHash("sha256").update(sourceBytes).digest("hex"),
			diagnostics: [],
		},
		sourceBytes,
	});
};
