import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { documentBytes } from "../../../../apps/server/src/services/flowDocuments";
import { createConversionProducer, inspectConversionGraph, applyConversionEdit } from "../../../../apps/server/src/services/langflowMigration";
import { sourceDigest } from "../../../../apps/server/src/services/langflowMigration/sourceDigest";
import { compilerPackage } from "./compilerPackage";
import { compilerScenarios } from "./compilerScenarios";
import { fixtureId, fixtureNode } from "./fixture";

const available = Boolean(process.env.TRELLIS_CONVERSION_CATALOG && process.env.TRELLIS_CONVERSION_TEMPLATES && process.env.TRELLIS_CONVERSION_PACKAGE_DIGEST);
const matched = available ? test : test.skip;
const validation = async () => [];

test("missing native template bytes retain blockers without a graph", async () => {
	const catalogBytes = await readFile(new URL("../../components/catalog/manifest.v1.json", import.meta.url));
	const catalog = JSON.parse(catalogBytes.toString("utf8"));
	const producer = createConversionProducer({ catalogBytes, frontendTemplateBytes: null,
		componentManifestHash: sourceDigest(catalogBytes), enginePackageDigest: "1".repeat(64),
		engineOverlayHash: "2".repeat(64), engineCommit: catalog.engine.commit, nativePolicies: {},
	}, validation);
	const result = await producer.compile({ sourceBytes: documentBytes(compilerScenarios().roots) });
	expect(result.state).toBe("blocked");
	if (result.state !== "blocked") throw new Error("blocked expected");
	expect(result.candidate).toBeNull();
	expect(result.diagnostics.some((item) => item.code === "conversion_frontend_templates_unavailable")).toBe(true);
	expect(result.diagnostics.some((item) => item.code === "ENGINE_TRACE_REQUIRED")).toBe(true);
});

matched("actual templates preserve independent roots, native bytes, and all 501 source nodes", async () => {
	const doc = compilerScenarios().dense!;
	const input = await compilerPackage(doc);
	const result = await createConversionProducer(input, validation).compile({ sourceBytes: documentBytes(doc) });
	const expansion = result.state === "generated" ? result.expansion : result.candidate;
	expect(expansion).not.toBeNull();
	expect(expansion!.graphDocument.edges).toEqual([]);
	expect(expansion!.nodeSpecs).toHaveLength(501);
	expect(expansion!.graphDocument.trellisSource).toEqual(doc);
	const entries = expansion!.graphDocument.trellisRequestSpecsV1 as Record<string, { instruction: string }>;
	for (const node of doc.nodes) expect(entries[node.id]!.instruction).toBe(node.instruction);
});

matched("branch edges use exact native handles and keep the common result separate", async () => {
	const doc = compilerScenarios().branching!;
	const result = await createConversionProducer(await compilerPackage(doc), validation).compile({ sourceBytes: documentBytes(doc) });
	const expansion = result.state === "generated" ? result.expansion : result.candidate;
	const edges = expansion!.graphDocument.edges as { id: string; source: string; sourceHandle: string; data: { sourceHandle: { name: string } } }[];
	for (const edge of doc.edges) {
		const generated = edges.find((item) => item.id === edge.id)!;
		expect(generated.source).toBe(`${fixtureId(1)}:decision`);
		expect(generated.data.sourceHandle.name).toBe(edge.branch);
		expect(JSON.parse(generated.sourceHandle.replaceAll("œ", '"'))).toEqual(generated.data.sourceHandle);
	}
});

matched("nested scopes retain input and output vertices, source order, deadlines, and empty entry", async () => {
	for (const doc of [compilerScenarios().nested!, compilerScenarios().empty!]) {
		const result = await createConversionProducer(await compilerPackage(doc), validation).compile({ sourceBytes: documentBytes(doc) });
		const expansion = result.state === "generated" ? result.expansion : result.candidate;
		const scopes = expansion!.graphDocument.groupScopes as Record<string, { minutes: number | null; childNodeIds: string[]; childVertices: Record<string, { inputVertexId: string; outputVertexId: string; settlementSourceVertexId: string }> }>;
		expect(scopes[fixtureId(1)]!.childNodeIds).toEqual(doc.nodes.filter((node) => node.parentId === fixtureId(1)).map((node) => node.id));
		expect(scopes[fixtureId(1)]!.minutes).toBe(doc.nodes[0]!.minutes);
		if (doc.nodes.length > 1) expect(scopes[fixtureId(1)]!.childVertices[fixtureId(2)]).toEqual({ inputVertexId: `${fixtureId(2)}:scope`, outputVertexId: `${fixtureId(2)}:output`, settlementSourceVertexId: `${fixtureId(2)}:output` });
		const edges = expansion!.graphDocument.edges as { id: string }[];
		expect(edges.some((edge) => edge.id === `${fixtureId(1)}:scope:${fixtureId(1)}:output`)).toBe(true);
	}
});

matched("regeneration and initial compilation share every edit mapping", async () => {
	const doc = compilerScenarios().loop!;
	doc.nodes.push(fixtureNode(4, { kind: "group", parentId: fixtureId(1) }));
	doc.nodes.push(fixtureNode(5, { parentId: fixtureId(4) }));
	const input = await compilerPackage(doc);
	const producer = createConversionProducer(input, validation);
	const first = await producer.compile({ sourceBytes: documentBytes(doc) });
	const expansion = first.state === "generated" ? first.expansion : first.candidate;
	const inspected = inspectConversionGraph({ sourceBytes: documentBytes(doc), catalogBytes: input.catalogBytes, expansion });
	expect(inspected.graphDocument).not.toBeNull();
	const edited = applyConversionEdit(doc, {
		schemaVersion: 1, flowId: doc.flow.id, expectedVersion: 72, expectedDocumentHash: "a".repeat(64),
		componentManifestHash: input.componentManifestHash, enginePackageDigest: input.enginePackageDigest,
		requestId: "e5014f06-99d8-4cc2-b53f-81bf76987fa0", edits: [
			{ kind: "set-flow-briefing", briefing: "  Updated\r\nbriefing " },
			{ kind: "set-flow-harness", harness: null },
			{ kind: "set-node-instruction", sourceNodeId: fixtureId(2), instruction: "  Updated\r\ninstruction " },
			{ kind: "set-node-harness", sourceNodeId: fixtureId(2), harness: null },
			{ kind: "set-loop-rounds", sourceNodeId: fixtureId(1), maxRounds: 52 },
			{ kind: "set-group-policy", sourceNodeId: fixtureId(4), parallel: true, minutes: 99 },
		],
	});
	const bytes = documentBytes(edited);
	const regenerated = await producer.regenerate({ editedSourceBytes: bytes, previousGraphDocument: inspected.graphDocument! });
	expect(regenerated).toEqual(await producer.compile({ sourceBytes: bytes }));
	expect(doc.nodes[0]!.maxRounds).toBe(51);
});

matched("nested entry loops receive control scope without a predecessor seed", async () => {
	const doc = compilerScenarios().loop!;
	doc.nodes.unshift(fixtureNode(10, { kind: "group" }));
	doc.nodes[1]!.parentId = fixtureId(10);
	const result = await createConversionProducer(await compilerPackage(doc), validation).compile({ sourceBytes: documentBytes(doc) });
	const expansion = result.state === "generated" ? result.expansion : result.candidate;
	const edges = expansion!.graphDocument.edges as { target: string; data: { targetHandle: { fieldName?: string } } }[];
	const inputs = edges.filter((edge) => edge.target === fixtureId(1)).map((edge) => edge.data.targetHandle.fieldName).filter(Boolean);
	expect(inputs).toEqual(["scope_entry"]);
});
