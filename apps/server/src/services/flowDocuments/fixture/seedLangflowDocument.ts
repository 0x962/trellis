import { createHash } from "node:crypto";
import type { Flow, FlowDocumentContentV1 } from "@trellis/api";
import { insertDocumentRevision } from "../../../db/queries/langflowDocuments";
import type { Tx } from "../../../db/tx.ts";
import { documentBytes } from "../documentBytes";

export const seedLangflowDocument = async (tx: Tx, input: { flow: Flow; savedAt: Date }) => {
	const content: FlowDocumentContentV1 = {
		schemaVersion: 1,
		engine: "langflow",
		graphDocument: { nodes: [], edges: [] },
		componentManifestHash: "c".repeat(64),
	};
	const sourceBytes = documentBytes(content);
	await insertDocumentRevision(tx, {
		snapshot: {
			...content,
			flow: input.flow,
			revision: input.flow.version,
			documentHash: createHash("sha256").update(sourceBytes).digest("hex"),
			diagnostics: [],
		},
		sourceBytes,
		savedAt: input.savedAt,
	});
};
