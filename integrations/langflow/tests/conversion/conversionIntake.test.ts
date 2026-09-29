import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FlowPublicationV1 } from "@trellis/api";
import { documentBytes } from "../../../../apps/server/src/services/flowDocuments";
import {
	checkConversionIntake,
	inspectConversionGraph,
	prepareConversionIntake,
	readConversionBinding,
} from "../../../../apps/server/src/services/langflowMigration";
import { sourceDigest } from "../../../../apps/server/src/services/langflowMigration/sourceDigest";
import { fixtureDocument, fixtureId } from "./fixture/fixture";

const directories: string[] = [];
afterEach(async () => {
	await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

const inputs = () => {
	const source = fixtureDocument();
	const node = source.nodes[0]!;
	const spec = {
		nodeId: node.id,
		taskKeyBase: "saved/task/base",
		name: node.title,
		instruction: "  retained static text\r\n",
		harness: { preset: "claude", startCommand: "claude {{prompt}}", resumeCommand: "claude --resume {{prompt}}" },
	};
	const expansion = {
		graphDocument: {
			nodes: [{ id: "engine-node", type: "genericNode", data: { id: "engine-node", type: "TrellisNativeCompletionV1" } }],
			edges: [],
			trellisRequestSpecsV1: { "engine-node": spec },
		},
		nodeSpecs: [{ sourceNodeId: node.id, engineNodeId: "engine-node", definitionId: "native-completion-v1", phase: "step", specNamespace: "trellisRequestSpecsV1" }],
	};
	return { source, spec, expansion, sourceBytes: Buffer.from(JSON.stringify(source, null, 2)) };
};

const catalogBytes = () => readFile(new URL("../../components/catalog/manifest.v1.json", import.meta.url));

test("matches the occurrence producer's canonical bytes and hash vectors", async () => {
	const cases = JSON.parse(await readFile(new URL("../occurrenceRequests/spec-hash-cases.json", import.meta.url), "utf8")) as {
		spec: unknown;
		canonical: string;
		sha256: string;
	}[];
	for (const item of cases) {
		const bytes = documentBytes(item.spec);
		expect(bytes.toString("utf8")).toBe(item.canonical);
		expect(sourceDigest(bytes)).toBe(item.sha256);
	}
});

test("retains complete source bytes and hashes only the shared static entry", async () => {
	const input = inputs();
	const result = inspectConversionGraph({ ...input, catalogBytes: await catalogBytes() });
	expect(result.graphDocument).not.toBeNull();
	const graph = result.graphDocument!;
	expect(Buffer.from(graph.trellisConversionV1.source.bytesBase64, "base64")).toEqual(input.sourceBytes);
	expect(graph.trellisConversionV1.nodeSpecs[0]!.specHash).toBe(sourceDigest(documentBytes(input.spec)));
	expect(graph.trellisConversionV1.nodeSpecs[0]!.sourceNodeHash).toBe(sourceDigest(documentBytes(input.source.nodes[0])));
	expect(result.diagnostics.map((item) => item.code)).toContain("conversion_execution_unverified");
	expect(result.diagnostics.map((item) => item.code)).toContain("conversion_harness_policy_unverified");
});

test("rejects invented or duplicate vertex associations", async () => {
	const input = inputs();
	input.expansion.nodeSpecs.push({ ...input.expansion.nodeSpecs[0]! });
	expect(inspectConversionGraph({ ...input, catalogBytes: await catalogBytes() }).graphDocument).toBeNull();
	input.expansion.nodeSpecs.pop();
	input.expansion.nodeSpecs[0]!.engineNodeId = "absent";
	expect(inspectConversionGraph({ ...input, catalogBytes: await catalogBytes() }).graphDocument).toBeNull();
});

test("preserves explicit harness strings and refuses normalization", async () => {
	const input = inputs();
	input.source.flow.harness = { preset: "claude", model: " anthropic/claude-sonnet-5.5 " };
	input.sourceBytes = Buffer.from(JSON.stringify(input.source));
	Object.assign(input.spec.harness, { model: "anthropic/claude-sonnet-5.5" });
	expect(inspectConversionGraph({ ...input, catalogBytes: await catalogBytes() }).graphDocument).toBeNull();
	Object.assign(input.spec.harness, { model: input.source.flow.harness.model });
	expect(inspectConversionGraph({ ...input, catalogBytes: await catalogBytes() }).graphDocument).not.toBeNull();
});

test("retains blocked copies and invalidates changed expansion bytes", async () => {
	const input = inputs();
	const directory = await mkdtemp(join(tmpdir(), "trellis-conversion-intake-"));
	directories.push(directory);
	const catalog = await catalogBytes();
	const expansionBytes = documentBytes(input.expansion);
	const intake = await prepareConversionIntake({
		exportDirectory: directory,
		sourceBytes: input.sourceBytes,
		catalogBytes: catalog,
		expansionBytes,
		targetEngineVersion: JSON.parse(catalog.toString()).engine.version,
	});
	expect(intake.state).toBe("blocked");
	expect(intake.record.targetDocumentHash).toBeNull();
	expect(intake.record.nodeMap).toEqual({});
	expect(await readFile(intake.expansion.exportRef)).toEqual(expansionBytes);
	const current = { flowId: input.source.flow.id, version: input.source.flow.version, sourceBytes: input.sourceBytes, catalogBytes: catalog, expansionBytes };
	expect(await checkConversionIntake(intake, current)).toEqual([]);
	expect((await checkConversionIntake(intake, { ...current, expansionBytes: Buffer.from("{}") })).map((item) => item.code)).toContain("conversion_expansion_changed");
	await writeFile(intake.candidate!.exportRef, "{}");
	expect((await checkConversionIntake(intake, current)).map((item) => item.code)).toContain("conversion_export_changed");
});

test("reads original provenance after publication validation and rejects a changed spec", async () => {
	const input = inputs();
	const catalog = await catalogBytes();
	const graphDocument = inspectConversionGraph({ ...input, catalogBytes: catalog }).graphDocument!;
	const publication: FlowPublicationV1 = {
		publicationId: fixtureId(101), flowId: input.source.flow.id, revision: 72,
		documentHash: "a".repeat(64), engineFlowId: "engine-flow", enginePackageDigest: "b".repeat(64),
		componentManifestHash: sourceDigest(catalog), publishedAt: "2026-09-29T00:00:00.000Z",
		conversion: { converterVersion: "fixture", sourceDocumentHash: sourceDigest(input.sourceBytes) },
	};
	const visit = { engineNodeId: "engine-node", phase: "step" as const, specNamespace: "trellisRequestSpecsV1" as const };
	const verified = { publication, graphDocument };
	expect(readConversionBinding(verified, visit).sourceNode).toEqual(input.source.nodes[0]!);
	expect(() => readConversionBinding(verified, { ...visit, phase: "condition" })).toThrow("conversion_visit_conflict");
	expect(() => readConversionBinding({ ...verified, publication: { ...publication, conversion: null } }, visit)).toThrow("conversion_publication_conflict");
	const changed = structuredClone(graphDocument);
	changed.trellisConversionV1.nodeSpecs[0]!.specHash = "f".repeat(64);
	expect(() => readConversionBinding({ publication, graphDocument: changed }, visit)).toThrow("conversion_spec_hash_conflict");
});
