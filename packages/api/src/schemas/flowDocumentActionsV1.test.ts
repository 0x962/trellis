import { expect, test } from "bun:test";
import {
	ActivateConversionV1InputSchema,
	type ConversionEditIntentV1,
	ConversionEditIntentV1Schema,
	FlowDocumentActionResultV1Schema,
	PublishDocumentV1InputSchema,
} from "./flowDocumentActionsV1";

const identity = {
	flowId: "01M3NX3JHK0R4QECST1VE9HCMS",
	expectedVersion: 3,
	expectedDocumentHash: "a".repeat(64),
	componentManifestHash: "b".repeat(64),
	enginePackageDigest: "c".repeat(64),
	requestId: "00000000-0000-4000-8000-000000000001",
};

test("publication and conversion bind a stable flow and exact package identities", () => {
	for (const schema of [PublishDocumentV1InputSchema, ActivateConversionV1InputSchema]) {
		expect(schema.parse(identity)).toEqual(identity);
		expect(schema.safeParse({ ...identity, flowId: "review" }).success).toBe(false);
		expect(schema.safeParse({ ...identity, graphDocument: {} }).success).toBe(false);
		expect(schema.safeParse({ ...identity, expectedDocumentHash: null }).success).toBe(false);
	}
});

test("all six explicit edit kinds preserve original text", () => {
	const input: ConversionEditIntentV1 = {
		...identity,
		schemaVersion: 1,
		edits: [
			{ kind: "set-flow-briefing", briefing: "  Original briefing\n" },
			{ kind: "set-flow-harness", harness: null },
			{ kind: "set-node-instruction", sourceNodeId: identity.flowId, instruction: "\tExact instruction  " },
			{ kind: "set-node-harness", sourceNodeId: identity.flowId, harness: null },
			{ kind: "set-group-policy", sourceNodeId: identity.flowId, parallel: false, minutes: 3 },
			{ kind: "set-loop-rounds", sourceNodeId: identity.flowId, maxRounds: 2 },
		],
	};
	expect(ConversionEditIntentV1Schema.parse(input)).toEqual(input);
	expect(ConversionEditIntentV1Schema.safeParse({ ...input, specHash: "d".repeat(64) }).success).toBe(false);
	expect(ConversionEditIntentV1Schema.safeParse({ ...input, edits: [] }).success).toBe(false);
	expect(
		ConversionEditIntentV1Schema.safeParse({
			...input,
			edits: [{ kind: "nodeInstruction", sourceNodeId: identity.flowId, instruction: "text" }],
		}).success,
	).toBe(false);
});

test("pending and blocked results cannot carry a fabricated committed receipt", () => {
	expect(FlowDocumentActionResultV1Schema.parse({ state: "pending", requestId: identity.requestId })).toEqual({
		state: "pending",
		requestId: identity.requestId,
	});
	expect(FlowDocumentActionResultV1Schema.parse({ state: "blocked", diagnostics: [] })).toEqual({
		state: "blocked",
		diagnostics: [],
	});
	expect(
		FlowDocumentActionResultV1Schema.safeParse({ state: "pending", requestId: identity.requestId, document: null })
			.success,
	).toBe(false);
	expect(
		FlowDocumentActionResultV1Schema.safeParse({ state: "blocked", requestId: identity.requestId, diagnostics: [] })
			.success,
	).toBe(false);
});
