import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { documentBytes } from "../../../../apps/server/src/services/flowDocuments";
import {
	applyConversionEdit,
	ConversionEditIntentV1Schema,
	type ConversionEditBase,
	type ConversionEditIntentV1,
	type EditedSourceV1,
	inspectConversionGraph,
	prepareConversionEdit,
	readConversionSource,
} from "../../../../apps/server/src/services/langflowMigration";
import { sourceDigest } from "../../../../apps/server/src/services/langflowMigration/sourceDigest";
import { fixtureDocument } from "./fixture/fixture";

const fixture = async () => {
	const source = fixtureDocument();
	const originalBytes = Buffer.from(JSON.stringify(source, null, 2));
	const catalogBytes = await readFile(new URL("../../components/catalog/manifest.v1.json", import.meta.url));
	const componentManifestHash = sourceDigest(catalogBytes);
	const expansion = { graphDocument: { nodes: [], edges: [] }, nodeSpecs: [] };
	const graphDocument = inspectConversionGraph({ sourceBytes: originalBytes, catalogBytes, expansion }).graphDocument!;
	const base: ConversionEditBase = {
		schemaVersion: 1, engine: "langflow", flow: source.flow, revision: 71,
		documentHash: "a".repeat(64), componentManifestHash, diagnostics: [], graphDocument,
	};
	const intent: ConversionEditIntentV1 = {
		schemaVersion: 1, flowId: source.flow.id, expectedVersion: base.revision,
		expectedDocumentHash: base.documentHash, componentManifestHash, enginePackageDigest: "b".repeat(64),
		requestId: randomUUID(), edits: [{ kind: "set-node-instruction", sourceNodeId: source.nodes[0]!.id, instruction: " New\r\ntext " }],
	};
	return { source, originalBytes, catalogBytes, expansion, graphDocument, base, intent };
};

test("preserves model strings and rejects unknown edit fields", async () => {
	const f = await fixture();
	const harness = { preset: "claude" as const, model: " anthropic/claude-sonnet-5.5 " };
	const value = { ...f.intent, edits: [{ kind: "set-flow-harness", harness }] };
	const parsed = ConversionEditIntentV1Schema.parse(value);
	expect(parsed.edits[0]).toEqual(value.edits[0]!);
	expect(() => ConversionEditIntentV1Schema.parse({ ...value, graphDocument: {} })).toThrow();
	expect(() => ConversionEditIntentV1Schema.parse({ ...value, edits: [{ kind: "nodeHarness", harness }] })).toThrow();
	expect(() => ConversionEditIntentV1Schema.parse({ ...value, edits: [] })).toThrow();
});

test("applies exact edits to a copy and retains original source metadata", async () => {
	const f = await fixture();
	const edited = applyConversionEdit(f.source, f.intent);
	expect(edited.nodes[0]!.instruction).toBe(" New\r\ntext ");
	expect(f.source.nodes[0]!.instruction).not.toBe(edited.nodes[0]!.instruction);
	expect(edited.flow.version).toBe(f.source.flow.version);
	expect(edited.nodes[1]).toEqual(f.source.nodes[1]);
	expect(() => applyConversionEdit(f.source, {
		...f.intent, edits: [{ kind: "set-loop-rounds", sourceNodeId: f.source.nodes[0]!.id, maxRounds: 51 }],
	})).toThrow("conversion_edit_loop_required");
});

test("replays the full derived history and rejects a rehashed false result", async () => {
	const f = await fixture();
	const intentBytes = documentBytes(f.intent);
	const editedBytes = documentBytes(applyConversionEdit(f.source, f.intent));
	const edit: EditedSourceV1 = {
		schemaVersion: 1, revision: 72, sha256: sourceDigest(editedBytes), bytesBase64: editedBytes.toString("base64"),
		derivedFrom: { revision: 71, documentHash: f.base.documentHash, sourceHash: sourceDigest(f.originalBytes) },
		intent: { requestId: f.intent.requestId, sha256: sourceDigest(intentBytes), bytesBase64: intentBytes.toString("base64") },
	};
	const graph = { ...f.graphDocument, trellisConversionV1: { ...f.graphDocument.trellisConversionV1, editHistory: [], editedSource: edit } };
	const current = readConversionSource(graph);
	expect(current.originalBytes).toEqual(f.originalBytes);
	expect(current.source.nodes[0]!.instruction).toBe(" New\r\ntext ");
	const nextIntent = { ...f.intent, expectedVersion: 72, expectedDocumentHash: "c".repeat(64), requestId: randomUUID(), edits: [{ kind: "set-flow-briefing" as const, briefing: " New briefing " }] };
	const nextBytes = documentBytes(applyConversionEdit(current.source, nextIntent));
	const nextIntentBytes = documentBytes(nextIntent);
	const next: EditedSourceV1 = {
		schemaVersion: 1, revision: 73, sha256: sourceDigest(nextBytes), bytesBase64: nextBytes.toString("base64"),
		derivedFrom: { revision: 72, documentHash: nextIntent.expectedDocumentHash, sourceHash: sourceDigest(editedBytes) },
		intent: { requestId: nextIntent.requestId, sha256: sourceDigest(nextIntentBytes), bytesBase64: nextIntentBytes.toString("base64") },
	};
	const chain = { ...graph, trellisConversionV1: { ...graph.trellisConversionV1, editHistory: [edit], editedSource: next } };
	expect(readConversionSource(chain).source.flow.briefing).toBe(" New briefing ");
	const broken = structuredClone(chain);
	broken.trellisConversionV1.editHistory = [];
	expect(() => readConversionSource(broken)).toThrow("conversion_edit_chain_conflict");
	const forged = structuredClone(chain);
	forged.trellisConversionV1.editedSource.bytesBase64 = editedBytes.toString("base64");
	forged.trellisConversionV1.editedSource.sha256 = sourceDigest(editedBytes);
	expect(() => readConversionSource(forged)).toThrow("conversion_edit_result_conflict");
});

test("blocks missing producers and stale base identity before engine access", async () => {
	const f = await fixture();
	const missing = await prepareConversionEdit({ base: f.base, requestBytes: documentBytes(f.intent) }, null);
	expect(missing.state).toBe("blocked");
	if (missing.state === "blocked") expect(missing.diagnostics[0]!.code).toBe("conversion_regeneration_unavailable");
	const stale = await prepareConversionEdit({ base: f.base, requestBytes: documentBytes({ ...f.intent, expectedVersion: 70 }) }, null);
	expect(stale.state).toBe("blocked");
	if (stale.state === "blocked") expect(stale.diagnostics[0]!.code).toBe("conversion_edit_base_conflict");
});

test("preserves the execution blocker even when a callback supplies rehashed graph bytes", async () => {
	const f = await fixture();
	const result = await prepareConversionEdit({ base: f.base, requestBytes: documentBytes(f.intent) }, {
		enginePackageDigest: f.intent.enginePackageDigest, componentManifestHash: f.intent.componentManifestHash,
		catalogBytes: f.catalogBytes,
		regenerate: async () => ({ state: "generated", expansion: f.expansion }),
		validate: async () => [],
	});
	expect(result.state).toBe("blocked");
	if (result.state === "blocked") expect(result.diagnostics.map((item) => item.code)).toContain("conversion_execution_unverified");
});
