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
