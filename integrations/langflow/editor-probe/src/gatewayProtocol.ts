import {
	flowV1Digest,
	flowV1FixtureIds,
	publishedDocumentV1Example,
} from "../../../../packages/api/src/schemas/flowV1Fixtures.ts";
import { authorizeEditorRequest } from "./editorGrant.ts";
import { editorGrantFixture } from "./fixtures.ts";
import { dispatchGatewaySave, documentReceipt, type GatewaySaveState, sha256 } from "./gatewaySave.ts";
import { langflowComponentManifest, langflowGraphFixture } from "./langflowGraphFixture.ts";
import { narrowFrame } from "./narrowFrame.ts";

export const probeSessionCookie = "trellis_editor_probe=fixture-session";

export type GatewayRequest = {
	method: string;
	path: string;
	headers: Record<string, string>;
	bodyText: string;
	now: string;
};

export type GatewayResponse = {
	status: number;
	body: unknown;
	disconnect?: true;
};

export type GatewayEvidenceEvent = {
	method: string;
	path: string;
	status: number;
	sessionAccepted: boolean;
	requestId: string | null;
	requestBytes: string | null;
	requestBytesSha256: string;
	acceptedRevision: number | null;
	replayed: boolean;
	forbiddenSecret: string | null;
	reason: string | null;
	observedAt: string;
};

const deniedPaths = [
	/^\/api\/v1\/run(?:\/|$)/,
	/^\/api\/v1\/build(?:\/|$)/,
	/^\/api\/v1\/validate\/code(?:\/|$)/,
	/^\/api\/v1\/flows\/upload(?:\/|$)/,
	/^\/api\/v1\/variables(?:\/|$)/,
	/^\/api\/v2\/workflows(?:\/|$)/,
];

const sessionAccepted = (headers: Record<string, string>) =>
	(headers.cookie ?? "").split(/;\s*/).includes(probeSessionCookie);

const flowView = (revision: number, graphDocument: unknown) => ({
	id: flowV1FixtureIds.flow,
	name: publishedDocumentV1Example.flow.name,
	description: publishedDocumentV1Example.flow.description,
	data: graphDocument,
	flow_type: "workflow" as const,
	locked: false,
	access_type: "PRIVATE" as const,
	updated_at: new Date().toISOString(),
	version: revision,
});

export function createGatewayProtocol(input: { expiresAt: string; graphDocument?: unknown }) {
	const state: GatewaySaveState = {
		currentRevision: editorGrantFixture.revision,
		grant: { ...editorGrantFixture, expiresAt: input.expiresAt },
		graphDocument: structuredClone(input.graphDocument ?? langflowGraphFixture),
		loseNextSaveResponse: false,
		savedRequests: new Map(),
	};
	const events: GatewayEvidenceEvent[] = [];

	const record = (request: GatewayRequest, response: GatewayResponse, detail: Partial<GatewayEvidenceEvent> = {}) => {
		const event: GatewayEvidenceEvent = {
			method: request.method,
			path: request.path,
			status: response.status,
			sessionAccepted: sessionAccepted(request.headers),
			requestId: null,
			requestBytes: null,
			requestBytesSha256: sha256(request.bodyText),
			acceptedRevision: null,
			replayed: false,
			forbiddenSecret: null,
			reason: null,
			observedAt: request.now,
			...detail,
		};
		events.push(event);
		return response;
	};

	const authorizeRead = (
		request: GatewayRequest,
		operation: "document:read" | "component-manifest:read",
		flowId = state.grant.flowId,
	) =>
		authorizeEditorRequest(state.grant, {
			actor: state.grant.actor,
			hostId: state.grant.hostId,
			flowId,
			projectId: state.grant.projectId,
			revision: state.grant.revision,
			operation,
			now: request.now,
		});

	const authorizedRead = (
		request: GatewayRequest,
		operation: "document:read" | "component-manifest:read",
		body: unknown,
		flowId?: string,
	) => {
		const authorization = authorizeRead(request, operation, flowId);
		if (!authorization.allowed) {
			return record(
				request,
				{ status: 403, body: { error: authorization.reason } },
				{
					reason: authorization.reason,
				},
			);
		}
		return record(request, { status: 200, body });
	};

	const dispatch = (request: GatewayRequest): GatewayResponse => {
		if (!sessionAccepted(request.headers)) {
			return record(
				request,
				{ status: 401, body: { error: "editor_session_required" } },
				{
					reason: "editor_session_required",
				},
			);
		}
		if (deniedPaths.some((pattern) => pattern.test(request.path))) {
			return record(
				request,
				{ status: 403, body: { error: "operation_denied" } },
				{
					reason: "operation_denied",
				},
			);
		}
		if (request.method === "GET" && request.path === "/api/trellis-editor/v1/document") {
			return authorizedRead(request, "document:read", documentReceipt(state.currentRevision, state.graphDocument));
		}
		if (request.method === "GET" && request.path === "/__probe/narrow") {
			return authorizedRead(request, "document:read", narrowFrame);
		}
		if (request.method === "PUT" && request.path === "/api/trellis-editor/v1/document") {
			return dispatchGatewaySave({ request, state, record });
		}
		if (request.method === "GET" && request.path === "/api/trellis-editor/v1/component-manifest") {
			return authorizedRead(request, "component-manifest:read", structuredClone(langflowComponentManifest));
		}
		if (request.method === "POST" && request.path === "/__probe/lost-response-next") {
			state.loseNextSaveResponse = true;
			return record(request, { status: 200, body: { armed: true } });
		}
		if (request.method === "POST" && request.path === "/__probe/advance-revision") {
			state.currentRevision += 1;
			return record(request, { status: 200, body: { revision: state.currentRevision } });
		}
		if (request.method === "POST" && request.path === "/__probe/expire-grant") {
			state.grant = { ...state.grant, expiresAt: request.now };
			return record(request, { status: 200, body: { expiredAt: request.now } });
		}
		if (request.method === "GET" && request.path === "/__probe/state") {
			return record(request, { status: 200, body: snapshot() });
		}
		if (request.method === "GET" && request.path === "/api/v1/session") {
			return authorizedRead(request, "document:read", {
				authenticated: true,
				user: { id: "editor-fixture-user", username: "Editor fixture", is_active: true, is_superuser: false },
			});
		}
		if (request.method === "GET" && request.path === "/api/v1/auto_login") {
			return authorizedRead(request, "document:read", {});
		}
		if (request.method === "GET" && request.path === "/health_check") {
			return authorizedRead(request, "document:read", { status: "ok" });
		}
		if (request.method === "GET" && request.path === "/api/v1/version") {
			return record(request, {
				status: 200,
				body: { version: "1.12.3", package: "langflow", main_version: "1.12.3" },
			});
		}
		if (request.method === "GET" && request.path === "/api/v1/flows/basic_examples/") {
			return record(request, { status: 200, body: [] });
		}
		if (request.method === "GET" && request.path === "/api/v1/all") {
			return authorizedRead(request, "component-manifest:read", structuredClone(langflowComponentManifest));
		}
		const flowRoute = request.path.match(/^\/api\/v1\/flows\/([^/]+)\/?$/);
		if (request.method === "GET" && flowRoute) {
			return authorizedRead(
				request,
				"document:read",
				flowView(state.currentRevision, state.graphDocument),
				flowRoute[1],
			);
		}
		if (request.method === "GET" && request.path === "/api/v1/flows/") {
			return authorizedRead(request, "document:read", [flowView(state.currentRevision, state.graphDocument)]);
		}
		return record(request, { status: 404, body: { error: "route_not_found" } }, { reason: "route_not_found" });
	};

	const snapshot = () => ({
		flowId: flowV1FixtureIds.flow,
		currentRevision: state.currentRevision,
		graphDocumentHash: sha256(JSON.stringify(state.graphDocument)),
		componentManifestHash: flowV1Digest,
		lostResponseArmed: state.loseNextSaveResponse,
		events: structuredClone(events),
	});

	return { dispatch, snapshot };
}
