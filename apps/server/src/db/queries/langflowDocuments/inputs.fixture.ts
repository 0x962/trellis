import type { FlowDocumentContentV1 } from "@trellis/api";
import type { SaveDocumentInput } from "./save.ts";

export const flowId = "00000000000000000000000001";
export const savedAt = new Date("2026-09-29T07:00:00.000Z");
export const content: FlowDocumentContentV1 = {
	schemaVersion: 1,
	engine: "langflow",
	graphDocument: { data: { nodes: [], edges: [] } },
	componentManifestHash: "c".repeat(64),
};
export const saveInput = (overrides: Partial<SaveDocumentInput> = {}): SaveDocumentInput => ({
	flowId,
	expectedVersion: 1,
	requestId: "b9e9b394-f091-41da-96ca-591b678aac83",
	requestBytes: Buffer.from('{ "flow": "review", "expectedVersion": 1 }\r\n'),
	sourceBytes: Buffer.from(JSON.stringify(content)),
	content,
	diagnostics: [],
	savedAt,
	...overrides,
});
