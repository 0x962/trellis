import { createHash } from "node:crypto";
import type { FlowDocumentV1 } from "@trellis/api";
import { flowV1Digest, publishedDocumentV1Example } from "../../../../packages/api/src/schemas/flowV1Fixtures.ts";
import { forbiddenBrowserSecret } from "./browserBoundary.ts";
import { authorizeEditorRequest, type EditorGrant } from "./editorGrant.ts";
import type { GatewayEvidenceEvent, GatewayRequest, GatewayResponse } from "./gatewayProtocol.ts";
import { evaluateSaveGateway } from "./saveGatewayProbe.ts";

export type SaveReceipt = Extract<FlowDocumentV1, { engine: "langflow" }>;

type SavedRequest = {
	bodyHash: string;
	receipt: SaveReceipt;
};

export type GatewaySaveState = {
	currentRevision: number;
	grant: EditorGrant;
	graphDocument: unknown;
	loseNextSaveResponse: boolean;
	savedRequests: Map<string, SavedRequest>;
};

type RecordEvent = (
	request: GatewayRequest,
	response: GatewayResponse,
	detail?: Partial<GatewayEvidenceEvent>,
) => GatewayResponse;

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export const documentReceipt = (revision: number, graphDocument: unknown): SaveReceipt => {
	const documentHash = sha256(JSON.stringify(graphDocument));
	return {
		schemaVersion: 1,
		engine: "langflow",
		flow: { ...publishedDocumentV1Example.flow, version: revision },
		graphDocument: graphDocument as SaveReceipt["graphDocument"],
		componentManifestHash: flowV1Digest,
		revision,
		documentHash,
		diagnostics: [],
		publication: { state: "not_requested", revision },
		lastExecutablePublication: null,
	};
};

const parseJson = (bodyText: string): unknown => (bodyText === "" ? null : JSON.parse(bodyText));

export function dispatchGatewaySave(input: {
	request: GatewayRequest;
	state: GatewaySaveState;
	record: RecordEvent;
}): GatewayResponse {
	const { request, state, record } = input;
	const authorization = authorizeEditorRequest(state.grant, {
		actor: state.grant.actor,
		hostId: state.grant.hostId,
		flowId: state.grant.flowId,
		projectId: state.grant.projectId,
		revision: state.grant.revision,
		operation: "document:save",
		now: request.now,
	});
	if (!authorization.allowed) {
		return record(
			request,
			{ status: 403, body: { error: authorization.reason } },
			{
				reason: authorization.reason,
			},
		);
	}
	const body = parseJson(request.bodyText);
	const forbiddenSecret = forbiddenBrowserSecret({ headers: request.headers, body });
	const requestId =
		typeof body === "object" && body !== null && "requestId" in body && typeof body.requestId === "string"
			? body.requestId
			: null;
	const bodyHash = sha256(request.bodyText);

	if (requestId !== null) {
		const saved = state.savedRequests.get(requestId);
		if (saved) {
			if (saved.bodyHash !== bodyHash) {
				return record(
					request,
					{ status: 409, body: { error: "request_conflict" } },
					{
						requestId,
						forbiddenSecret,
						reason: "request_conflict",
					},
				);
			}
			return record(
				request,
				{ status: 200, body: saved.receipt },
				{
					requestId,
					requestBytes: request.bodyText,
					acceptedRevision: saved.receipt.revision,
					replayed: true,
					forbiddenSecret,
				},
			);
		}
	}

	const result = evaluateSaveGateway({
		grant: state.grant,
		requestContext: {
			actor: state.grant.actor,
			hostId: state.grant.hostId,
			flowId: state.grant.flowId,
			projectId: state.grant.projectId,
			revision: state.grant.revision,
			now: request.now,
		},
		route: { method: request.method, path: request.path },
		browserRequest: { headers: request.headers, body },
		currentRevision: state.currentRevision,
	});
	if (!result.accepted) {
		const status = result.reason === "version_conflict" ? 409 : 403;
		return record(
			request,
			{ status, body: { error: result.reason } },
			{
				requestId,
				forbiddenSecret,
				reason: result.reason,
			},
		);
	}

	state.currentRevision = result.nextRevision;
	state.graphDocument = structuredClone(result.request.graphDocument);
	state.grant = { ...state.grant, revision: state.currentRevision };
	const receipt = documentReceipt(state.currentRevision, state.graphDocument);
	state.savedRequests.set(result.request.requestId, { bodyHash, receipt });
	const disconnect = state.loseNextSaveResponse;
	state.loseNextSaveResponse = false;
	return record(
		request,
		{ status: 200, body: receipt, ...(disconnect ? { disconnect: true as const } : {}) },
		{
			requestId: result.request.requestId,
			requestBytes: request.bodyText,
			acceptedRevision: state.currentRevision,
			forbiddenSecret,
		},
	);
}
