import { describe, expect, test } from "bun:test";
import { flowV1Digest, flowV1RequestId } from "../../../../packages/api/src/schemas/flowV1Fixtures.ts";
import { editorGraphFixture, saveRequestFixture } from "./fixtures.ts";
import { createGatewayProtocol, type GatewayRequest, probeSessionCookie } from "./gatewayProtocol.ts";
import { langflowGraphFixture } from "./langflowGraphFixture.ts";

const now = "2026-09-29T07:45:00Z";
const sessionHeaders = { cookie: probeSessionCookie, "content-type": "application/json" };

const request = (input: Partial<GatewayRequest> & Pick<GatewayRequest, "method" | "path">): GatewayRequest => ({
	headers: sessionHeaders,
	bodyText: "",
	now,
	...input,
});

const saveBody = (input: {
	expectedVersion: number;
	requestId: string;
	graphDocument?: unknown;
	componentManifestHash?: string;
}) =>
	JSON.stringify({
		...saveRequestFixture,
		expectedVersion: input.expectedVersion,
		requestId: input.requestId,
		graphDocument: input.graphDocument ?? langflowGraphFixture,
		componentManifestHash: input.componentManifestHash ?? flowV1Digest,
	});

describe("gateway prototype", () => {
	test("requires the editor session for the document routes", () => {
		const gateway = createGatewayProtocol({ expiresAt: "2026-09-29T08:15:00Z" });
		expect(
			gateway.dispatch(request({ method: "GET", path: "/api/trellis-editor/v1/document", headers: {} })),
		).toMatchObject({ status: 401, body: { error: "editor_session_required" } });
	});

	test("serves the restricted document and component manifest", () => {
		const gateway = createGatewayProtocol({ expiresAt: "2026-09-29T08:15:00Z" });
		expect(gateway.dispatch(request({ method: "GET", path: "/api/trellis-editor/v1/document" }))).toMatchObject({
			status: 200,
			body: { engine: "langflow", revision: 2, graphDocument: { nodes: expect.any(Array) } },
		});
		expect(
			gateway.dispatch(request({ method: "GET", path: "/api/trellis-editor/v1/component-manifest" })),
		).toMatchObject({ status: 200, body: { trellis: expect.any(Object) } });
	});

	test("denies an unrelated legacy flow route", () => {
		const gateway = createGatewayProtocol({ expiresAt: "2026-09-29T08:15:00Z" });
		expect(gateway.dispatch(request({ method: "GET", path: "/api/v1/flows/another-flow" }))).toMatchObject({
			status: 403,
			body: { error: "flow_mismatch" },
		});
		expect(gateway.dispatch(request({ method: "GET", path: "/api/v1/flows/another-flow/history" }))).toMatchObject({
			status: 404,
			body: { error: "route_not_found" },
		});
	});

	test("denies execution, code, import, variable, and workflow routes", () => {
		const gateway = createGatewayProtocol({ expiresAt: "2026-09-29T08:15:00Z" });
		for (const path of [
			"/api/v1/run/probe",
			"/api/v1/build/probe/flow",
			"/api/v1/validate/code",
			"/api/v1/flows/upload",
			"/api/v1/variables",
			"/api/v2/workflows/probe",
		]) {
			expect(gateway.dispatch(request({ method: "POST", path }))).toEqual({
				status: 403,
				body: { error: "operation_denied" },
			});
		}
	});

	test("replays a lost save and then accepts the newer draft", () => {
		const gateway = createGatewayProtocol({ expiresAt: "2026-09-29T08:15:00Z" });
		gateway.dispatch(request({ method: "POST", path: "/__probe/lost-response-next" }));
		const firstBody = saveBody({ expectedVersion: 2, requestId: flowV1RequestId });
		const first = gateway.dispatch(
			request({ method: "PUT", path: "/api/trellis-editor/v1/document", bodyText: firstBody }),
		);
		expect(first).toMatchObject({ status: 200, disconnect: true, body: { revision: 3 } });

		const newerGraph = structuredClone(langflowGraphFixture);
		newerGraph.nodes[0]!.position.x = 144;
		const retry = gateway.dispatch(
			request({ method: "PUT", path: "/api/trellis-editor/v1/document", bodyText: firstBody }),
		);
		expect(retry).toMatchObject({ status: 200, body: { revision: 3 } });

		const newerBody = saveBody({
			expectedVersion: 3,
			requestId: "04a41342-1dd6-47e6-a23e-3b3ee1955c12",
			graphDocument: newerGraph,
		});
		const newerSave = gateway.dispatch(
			request({ method: "PUT", path: "/api/trellis-editor/v1/document", bodyText: newerBody }),
		);
		expect(newerSave).toMatchObject({ status: 200, body: { revision: 4 } });

		const saveEvents = gateway.snapshot().events.filter((event) => event.path.endsWith("/document"));
		expect(saveEvents.map((event) => [event.acceptedRevision, event.replayed])).toEqual([
			[3, false],
			[3, true],
			[4, false],
		]);
		expect(saveEvents.every((event) => event.forbiddenSecret === null)).toBeTrue();
	});

	test("conflicts when one request identity carries changed bytes", () => {
		const gateway = createGatewayProtocol({ expiresAt: "2026-09-29T08:15:00Z" });
		const firstBody = saveBody({ expectedVersion: 2, requestId: flowV1RequestId });
		gateway.dispatch(request({ method: "PUT", path: "/api/trellis-editor/v1/document", bodyText: firstBody }));
		const changedBody = saveBody({
			expectedVersion: 3,
			requestId: flowV1RequestId,
			graphDocument: { ...langflowGraphFixture, viewport: { x: 4, y: 0, zoom: 0.75 } },
		});
		expect(
			gateway.dispatch(request({ method: "PUT", path: "/api/trellis-editor/v1/document", bodyText: changedBody })),
		).toMatchObject({ status: 409, body: { error: "request_conflict" } });
	});

	test("rejects a wrong manifest, altered component authority, and a schematic graph", () => {
		const gateway = createGatewayProtocol({ expiresAt: "2026-09-29T08:15:00Z" });
		const wrongManifest = saveBody({
			expectedVersion: 2,
			requestId: "49dc4492-a38f-4436-9690-bdc2f950e66e",
			componentManifestHash: "b".repeat(64),
		});
		expect(
			gateway.dispatch(request({ method: "PUT", path: "/api/trellis-editor/v1/document", bodyText: wrongManifest })),
		).toMatchObject({ status: 403, body: { error: "manifest_mismatch" } });

		const alteredGraph = structuredClone(langflowGraphFixture);
		alteredGraph.nodes[0]!.data.node.description = "Replacement component definition.";
		const alteredComponent = saveBody({
			expectedVersion: 2,
			requestId: "4ae2c220-2197-46d2-9c7a-00d564d6f89e",
			graphDocument: alteredGraph,
		});
		expect(
			gateway.dispatch(request({ method: "PUT", path: "/api/trellis-editor/v1/document", bodyText: alteredComponent })),
		).toMatchObject({ status: 403, body: { error: "component_authority_mismatch" } });

		const schematicGraph = saveBody({
			expectedVersion: 2,
			requestId: "be6a70a4-a8fb-4387-8580-58f7ea23d574",
			graphDocument: editorGraphFixture,
		});
		expect(
			gateway.dispatch(request({ method: "PUT", path: "/api/trellis-editor/v1/document", bodyText: schematicGraph })),
		).toMatchObject({ status: 403, body: { error: "invalid_document" } });
	});

	test("rejects reads and a replay after the grant expires", () => {
		const gateway = createGatewayProtocol({ expiresAt: "2026-09-29T07:46:00Z" });
		const firstBody = saveBody({ expectedVersion: 2, requestId: flowV1RequestId });
		gateway.dispatch(request({ method: "PUT", path: "/api/trellis-editor/v1/document", bodyText: firstBody }));
		for (const path of [
			"/api/trellis-editor/v1/document",
			"/api/trellis-editor/v1/component-manifest",
			"/api/v1/all",
			`/api/v1/flows/${saveRequestFixture.flow}`,
		]) {
			expect(gateway.dispatch(request({ method: "GET", path, now: "2026-09-29T07:46:00Z" }))).toMatchObject({
				status: 403,
				body: { error: "grant_expired" },
			});
		}
		expect(
			gateway.dispatch(
				request({
					method: "PUT",
					path: "/api/trellis-editor/v1/document",
					bodyText: firstBody,
					now: "2026-09-29T07:46:00Z",
				}),
			),
		).toMatchObject({ status: 403, body: { error: "grant_expired" } });
	});

	test("returns a version conflict after the stored revision advances", () => {
		const gateway = createGatewayProtocol({ expiresAt: "2026-09-29T08:15:00Z" });
		gateway.dispatch(request({ method: "POST", path: "/__probe/advance-revision" }));
		const staleBody = saveBody({ expectedVersion: 2, requestId: flowV1RequestId });
		for (const requestId of [flowV1RequestId, "4c404b4a-b46f-45d8-bbdc-a27dbb97fd74"]) {
			expect(
				gateway.dispatch(
					request({
						method: "PUT",
						path: "/api/trellis-editor/v1/document",
						bodyText: staleBody.replace(flowV1RequestId, requestId),
					}),
				),
			).toMatchObject({ status: 409, body: { error: "version_conflict" } });
		}
	});
});
