import { describe, expect, test } from "bun:test";
import { forbiddenBrowserSecret } from "./browserBoundary.ts";
import { componentKinds, connectWithKeyboard, inspectorFields } from "./editorDocument.ts";
import { authorizeEditorRequest, type EditorOperation, editorOperations } from "./editorGrant.ts";
import { editorRoutes, operationForEditorRoute } from "./editorRoute.ts";
import { editorGrantFixture, editorGraphFixture, probeTime, saveRequestFixture } from "./fixtures.ts";
import { langflowGraphFixture } from "./langflowGraphFixture.ts";
import { applySaveAcknowledgement, evaluateSyntheticSaveGateway } from "./saveGatewayProbe.ts";

const requestContext = {
	actor: editorGrantFixture.actor,
	hostId: editorGrantFixture.hostId,
	flowId: editorGrantFixture.flowId,
	projectId: editorGrantFixture.projectId,
	revision: editorGrantFixture.revision,
	operation: "document:save" as const,
	now: probeTime,
};
const saveRoute = { method: "PUT", path: "/api/trellis-editor/v1/document" };

describe("editor grant", () => {
	test("maps only three gateway routes to editor operations", () => {
		for (const route of editorRoutes) {
			expect(operationForEditorRoute(route.method, route.path)).toBe(route.operation);
		}
		for (const [method, path] of [
			["POST", "/api/v1/run/probe"],
			["POST", "/api/v1/build/probe/flow"],
			["POST", "/api/v1/validate/code"],
			["POST", "/api/v1/flows/upload"],
			["POST", "/api/v1/variables"],
			["POST", "/api/v2/workflows/probe"],
		] as const) {
			expect(operationForEditorRoute(method, path)).toBeNull();
		}
	});

	test("permits only the three editor operations", () => {
		const allowedOperations: readonly EditorOperation[] = editorGrantFixture.allowedOperations;
		for (const operation of allowedOperations) {
			expect(authorizeEditorRequest(editorGrantFixture, { ...requestContext, operation })).toEqual({
				allowed: true,
			});
		}
		const deniedOperations = editorOperations.filter((operation) => !allowedOperations.includes(operation));
		for (const operation of deniedOperations) {
			expect(authorizeEditorRequest(editorGrantFixture, { ...requestContext, operation })).toEqual({
				allowed: false,
				reason: "operation_denied",
			});
		}
	});

	test.each([
		["actor", "human:someone-else", "actor_mismatch"],
		["hostId", "other-host", "host_mismatch"],
		["flowId", "other-flow", "flow_mismatch"],
		["projectId", "other-project", "project_mismatch"],
		["revision", 1, "revision_mismatch"],
	] as const)("rejects a wrong %s", (field, value, reason) => {
		expect(authorizeEditorRequest(editorGrantFixture, { ...requestContext, [field]: value })).toEqual({
			allowed: false,
			reason,
		});
	});

	test("rejects an expired grant", () => {
		expect(
			authorizeEditorRequest(editorGrantFixture, { ...requestContext, now: editorGrantFixture.expiresAt }),
		).toEqual({ allowed: false, reason: "grant_expired" });
	});
});

describe("browser boundary", () => {
	test("rejects broad credentials in headers and nested fields", () => {
		expect(forbiddenBrowserSecret({ headers: { Authorization: "Bearer secret" }, body: {} })).toBe("Authorization");
		expect(forbiddenBrowserSecret({ headers: {}, body: { data: { providerApiKey: "secret" } } })).toBe(
			"providerApiKey",
		);
	});

	test("accepts the secret-free document request", () => {
		expect(
			forbiddenBrowserSecret({ headers: { "content-type": "application/json" }, body: saveRequestFixture }),
		).toBeNull();
	});

	test("rejects an arbitrary Python field", () => {
		expect(forbiddenBrowserSecret({ headers: {}, body: { config: { code: "print('no')" } } })).toBe("code");
	});
});

describe("document save", () => {
	test("rejects a read route at the save gateway", () => {
		expect(
			evaluateSyntheticSaveGateway({
				grant: { ...editorGrantFixture, allowedOperations: ["document:read", "document:save"] },
				requestContext,
				route: { method: "GET", path: "/api/trellis-editor/v1/document" },
				browserRequest: { headers: {}, body: saveRequestFixture },
				currentRevision: editorGrantFixture.revision,
			}),
		).toEqual({ accepted: false, reason: "operation_denied" });
	});

	test("rejects a document for another flow", () => {
		expect(
			evaluateSyntheticSaveGateway({
				grant: editorGrantFixture,
				requestContext,
				route: saveRoute,
				browserRequest: {
					headers: {},
					body: { ...saveRequestFixture, flow: "01M3OTHERFLOW00000000000000" },
				},
				currentRevision: editorGrantFixture.revision,
			}),
		).toEqual({ accepted: false, reason: "flow_mismatch" });
	});

	test("rejects a document for another granted revision", () => {
		expect(
			evaluateSyntheticSaveGateway({
				grant: editorGrantFixture,
				requestContext,
				route: saveRoute,
				browserRequest: {
					headers: {},
					body: { ...saveRequestFixture, expectedVersion: editorGrantFixture.revision - 1 },
				},
				currentRevision: editorGrantFixture.revision - 1,
			}),
		).toEqual({ accepted: false, reason: "revision_mismatch" });
	});

	test("rejects component substitution outside the installed manifest", () => {
		const [firstNode, ...otherNodes] = editorGraphFixture.data.nodes;
		expect(
			evaluateSyntheticSaveGateway({
				grant: editorGrantFixture,
				requestContext,
				route: saveRoute,
				browserRequest: {
					headers: {},
					body: {
						...saveRequestFixture,
						graphDocument: {
							...editorGraphFixture,
							data: {
								...editorGraphFixture.data,
								nodes: [{ ...firstNode, type: "python" }, ...otherNodes],
							},
						},
					},
				},
				currentRevision: editorGrantFixture.revision,
			}),
		).toEqual({ accepted: false, reason: "invalid_document" });
	});

	test("accepts the public V1 request at the exact revision", () => {
		expect(
			evaluateSyntheticSaveGateway({
				grant: editorGrantFixture,
				requestContext,
				route: saveRoute,
				browserRequest: { headers: { "content-type": "application/json" }, body: saveRequestFixture },
				currentRevision: editorGrantFixture.revision,
			}),
		).toMatchObject({ accepted: true, nextRevision: editorGrantFixture.revision + 1 });
	});

	test("rejects a stale version before a write", () => {
		expect(
			evaluateSyntheticSaveGateway({
				grant: editorGrantFixture,
				requestContext,
				route: saveRoute,
				browserRequest: { headers: {}, body: saveRequestFixture },
				currentRevision: editorGrantFixture.revision + 1,
			}),
		).toEqual({ accepted: false, reason: "version_conflict" });
	});

	test("keeps edits that occur while a save waits", () => {
		const newestDraft = { generation: 4, document: editorGraphFixture };
		expect(applySaveAcknowledgement({ draft: newestDraft, submittedGeneration: 3 })).toBe(newestDraft);
		expect(applySaveAcknowledgement({ draft: newestDraft, submittedGeneration: 4 })).toBeNull();
	});
});

describe("editor behavior", () => {
	test("prepares seven safe Langflow nodes with typed handles", () => {
		expect(langflowGraphFixture.nodes).toHaveLength(componentKinds.length);
		for (const node of langflowGraphFixture.nodes) {
			expect(node.data.id).toBe(node.id);
			expect(node.data.node.outputs[0]).toMatchObject({ name: "result", types: ["Text"] });
			expect(Object.values(node.data.node.template).some((field) => field.input_types.includes("Text"))).toBeTrue();
			expect(JSON.stringify(node)).not.toContain('"code"');
			expect(JSON.stringify(node)).not.toContain('"password":true');
		}
	});

	test("defines a distinct inspector for each required component", () => {
		expect(Object.keys(inspectorFields).sort()).toEqual([...componentKinds].sort());
		for (const fields of Object.values(inspectorFields)) expect(fields.length).toBeGreaterThan(1);
	});

	test("adds a typed connection through the keyboard path", () => {
		const document = connectWithKeyboard(editorGraphFixture, {
			source: "agent-1",
			sourceOutput: "result",
			target: "native-gate-1",
			targetInput: "context",
		});
		expect(document.data.edges).toEqual([
			{
				id: "agent-1:result:native-gate-1:context",
				source: "agent-1",
				sourceOutput: "result",
				target: "native-gate-1",
				targetInput: "context",
			},
		]);
	});
});
