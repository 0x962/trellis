import { expect, test } from "bun:test";
import { contract, flowDocumentsV1, flowDocumentV1Errors } from "../contract/index.ts";
import { FlowDocSchema, FlowListInputSchema, FlowSaveInputSchema } from "./flow.ts";
import { FlowDocumentSaveV1InputSchema, FlowDocumentV1Schema } from "./flowDocumentV1.ts";
import {
	flowV1Id,
	flowV1RequestId,
	legacyDocumentV1Example,
	pendingDocumentV1Example,
	publishedDocumentV1Example,
} from "./flowV1Fixtures.ts";

const save = {
	flow: "review",
	schemaVersion: 1 as const,
	engine: "langflow" as const,
	graphDocument: pendingDocumentV1Example.graphDocument,
	componentManifestHash: pendingDocumentV1Example.componentManifestHash,
	expectedVersion: 1,
	requestId: flowV1RequestId,
};

test("legacy and Langflow fixtures retain their own document format", () => {
	for (const example of [legacyDocumentV1Example, pendingDocumentV1Example, publishedDocumentV1Example]) {
		expect(FlowDocumentV1Schema.parse(example)).toEqual(example);
		expect(FlowDocSchema.safeParse(example).success).toBe(false);
	}
	const { flow, graphDocument } = legacyDocumentV1Example;
	expect(FlowDocSchema.parse({ flow, ...graphDocument })).toEqual({ flow, ...graphDocument });
});

test("new saves require a revision and replay identity", () => {
	expect(FlowDocumentSaveV1InputSchema.parse(save)).toEqual(save);
	for (const field of ["expectedVersion", "requestId", "componentManifestHash"]) {
		expect(FlowDocumentSaveV1InputSchema.safeParse({ ...save, [field]: undefined }).success).toBe(false);
	}
	for (const expectedVersion of [0, -1, 1.5]) {
		expect(FlowDocumentSaveV1InputSchema.safeParse({ ...save, expectedVersion }).success).toBe(false);
	}
	expect(FlowDocumentSaveV1InputSchema.safeParse({ ...save, requestId: "request-1" }).success).toBe(false);
});

test("the legacy graph write and scope filters retain their contract", () => {
	expect(FlowSaveInputSchema.parse({ flow: "review", nodes: [], edges: [] })).toEqual({
		flow: "review",
		nodes: [],
		edges: [],
	});
	expect(FlowSaveInputSchema.safeParse(save).success).toBe(false);
	expect(FlowListInputSchema.parse({ project: "TRL", ticket: "TRL-665" })).toEqual({
		project: "TRL",
		ticket: "TRL-665",
	});
});

test("pending publication retains an older executable revision without replacing the saved revision", () => {
	const value = FlowDocumentV1Schema.parse(pendingDocumentV1Example);
	expect(value.revision).toBe(2);
	expect(value.publication.state).toBe("pending");
	expect(value.lastExecutablePublication?.revision).toBe(1);
});

test("publication receipts identify the saved bytes and component manifest", () => {
	const original = publishedDocumentV1Example;
	if (original.publication.state !== "published") throw new Error("Expected a published fixture.");
	for (const change of [{ revision: 1 }, { documentHash: "0".repeat(64) }, { componentManifestHash: "0".repeat(64) }]) {
		expect(
			FlowDocumentV1Schema.safeParse({
				...original,
				publication: { ...original.publication, publication: { ...original.publication.publication, ...change } },
			}).success,
		).toBe(false);
	}
	expect(FlowDocumentV1Schema.safeParse({ ...original, revision: 3 }).success).toBe(false);
});

test("a failed publication retains the saved graph and diagnostic", () => {
	const diagnostics = [
		{ code: "ENGINE_UNAVAILABLE", message: "The engine is unavailable.", severity: "error", path: [] },
	];
	const failed = { ...pendingDocumentV1Example, publication: { state: "failed", revision: 2, diagnostics } };
	expect(FlowDocumentV1Schema.parse(failed).graphDocument).toEqual(pendingDocumentV1Example.graphDocument);
	expect(
		FlowDocumentV1Schema.safeParse({ ...failed, publication: { ...failed.publication, diagnostics: [] } }).success,
	).toBe(false);
});

test("version and JSON boundaries reject unsupported input", () => {
	for (const change of [
		{ schemaVersion: 2 },
		{ engine: "other" },
		{ unexpected: true },
		{ graphDocument: [] },
		{ graphDocument: { fn: () => 1 } },
	]) {
		expect(FlowDocumentSaveV1InputSchema.safeParse({ ...save, ...change }).success).toBe(false);
	}
});

test("the unsupported-format error directs legacy clients to a versioned route", () => {
	const error = flowDocumentV1Errors.FLOW_UNSUPPORTED_FORMAT;
	expect(error.status).toBe(422);
	expect(
		error.data.parse({
			flowId: flowV1Id,
			engine: "langflow" as const,
			schemaVersion: 1 as const,
			operation: "read",
			supportedEndpoint: "/api/flows/review/document-v1",
			diagnostics: [
				{
					code: "NO_LOSSLESS_PROJECTION",
					message: "The legacy format cannot preserve this graph.",
					severity: "error",
					path: [],
				},
			],
		}).operation,
	).toBe("read");
	expect(flowDocumentV1Errors.FLOW_VERSION_CONFLICT.data.parse({ version: 2 })).toEqual({ version: 2 });
});

test("versioned route exports do not register services in the live contract", () => {
	expect(flowDocumentsV1.get["~orpc"].route).toMatchObject({ method: "GET", path: "/flows/{flow}/document-v1" });
	expect(flowDocumentsV1.save["~orpc"].route).toMatchObject({ method: "PUT", path: "/flows/{flow}/document-v1" });
	expect(flowDocumentsV1.view["~orpc"].route).toMatchObject({ method: "GET", path: "/flow-executions/{id}/view-v1" });
	expect(contract).not.toHaveProperty("flowDocumentsV1");
});

test("legacy saves reject unknown node and edge bytes", () => {
	const node = {
		id: flowV1Id,
		parentId: null,
		kind: "agent",
		title: "Review",
		instruction: "Read the diff.",
		minutes: null,
		maxRounds: null,
		x: 0,
		y: 0,
		width: null,
		height: null,
	};
	const edge = { id: flowV1Id, fromNodeId: flowV1Id, toNodeId: flowV1Id, branch: "out" };
	const input = {
		...save,
		engine: "legacy",
		componentManifestHash: null,
		graphDocument: { nodes: [node], edges: [edge] },
	};
	expect(FlowDocumentSaveV1InputSchema.safeParse(input).success).toBe(true);
	for (const unknown of ["first", "changed"]) {
		expect(
			FlowDocumentSaveV1InputSchema.safeParse({
				...input,
				graphDocument: { nodes: [{ ...node, unknown }], edges: [edge] },
			}).success,
		).toBe(false);
		expect(
			FlowDocumentSaveV1InputSchema.safeParse({
				...input,
				graphDocument: { nodes: [node], edges: [{ ...edge, unknown }] },
			}).success,
		).toBe(false);
	}
});

test("legacy saves enforce node kinds while snapshots retain the read schema", () => {
	const node = {
		id: flowV1Id,
		parentId: null,
		kind: "loop",
		title: "Review",
		instruction: "Read the diff.",
		minutes: null,
		maxRounds: null,
		x: 0,
		y: 0,
		width: null,
		height: null,
		parallel: false,
		harness: null,
	};
	const input = { ...save, engine: "legacy", componentManifestHash: null, graphDocument: { nodes: [node], edges: [] } };
	expect(FlowDocumentSaveV1InputSchema.safeParse(input).success).toBe(false);
	expect(
		FlowDocumentV1Schema.safeParse({ ...legacyDocumentV1Example, graphDocument: input.graphDocument }).success,
	).toBe(true);
	for (const change of [{ maxRounds: 3 }, { kind: "agent" }]) {
		expect(
			FlowDocumentSaveV1InputSchema.safeParse({
				...input,
				graphDocument: { nodes: [{ ...node, ...change }], edges: [] },
			}).success,
		).toBe(true);
	}
	for (const change of [
		{ kind: "human", harness: { preset: "codex" } },
		{ kind: "agent", minutes: 5 },
		{ kind: "agent", parallel: true },
	]) {
		expect(
			FlowDocumentSaveV1InputSchema.safeParse({
				...input,
				graphDocument: { nodes: [{ ...node, ...change }], edges: [] },
			}).success,
		).toBe(false);
	}
});

test("versioned legacy saves accept dense graph fixtures without graph-size ceilings", () => {
	const nodes = Array.from({ length: 501 }, (_, index) => ({
		id: String(index).padStart(26, "0"),
		parentId: null,
		kind: "agent",
		title: "Review",
		instruction: "Read the diff.",
		minutes: null,
		maxRounds: null,
		x: 0,
		y: 0,
		width: null,
		height: null,
	}));
	const edges = Array.from({ length: 2001 }, (_, index) => ({
		id: String(index).padStart(26, "0"),
		fromNodeId: nodes[index % 501]?.id,
		toNodeId: nodes[(index + 1) % 501]?.id,
		branch: "out",
	}));
	const value = FlowDocumentSaveV1InputSchema.parse({
		...save,
		engine: "legacy",
		componentManifestHash: null,
		graphDocument: { nodes, edges },
	});
	expect(value.engine).toBe("legacy");
	if (value.engine !== "legacy") throw new Error("Expected a legacy fixture.");
	expect(value.graphDocument.nodes).toHaveLength(501);
	expect(value.graphDocument.edges).toHaveLength(2001);
});
