import { type FlowDocumentSaveV1Input, FlowDocumentSaveV1InputSchema } from "@trellis/api";
import { flowV1Digest } from "../../../../packages/api/src/schemas/flowV1Fixtures.ts";
import { type BrowserRequest, forbiddenBrowserSecret } from "./browserBoundary.ts";
import { EditorGraphDocumentSchema } from "./editorDocument.ts";
import {
	authorizeEditorRequest,
	type EditorAuthorization,
	type EditorGrant,
	type EditorRequest,
} from "./editorGrant.ts";
import { operationForEditorRoute } from "./editorRoute.ts";
import { LangflowGraphDocumentSchema, matchesPinnedLangflowComponentAuthority } from "./langflowGraphFixture.ts";

type EditorDenialReason = Extract<EditorAuthorization, { allowed: false }>["reason"];

export type SaveGatewayResult =
	| {
			accepted: true;
			request: FlowDocumentSaveV1Input;
			nextRevision: number;
	  }
	| {
			accepted: false;
			reason:
				| EditorDenialReason
				| "component_authority_mismatch"
				| "invalid_document"
				| "manifest_mismatch"
				| "secret_present"
				| "version_conflict";
	  };

type SaveGatewayInput = {
	grant: EditorGrant;
	requestContext: Omit<EditorRequest, "operation">;
	route: { method: string; path: string };
	browserRequest: BrowserRequest;
	currentRevision: number;
};

function evaluateSaveGatewayInput(input: SaveGatewayInput, graphShape: "langflow" | "synthetic"): SaveGatewayResult {
	const operation = operationForEditorRoute(input.route.method, input.route.path);
	if (operation !== "document:save") {
		return { accepted: false, reason: "operation_denied" };
	}
	const authorization = authorizeEditorRequest(input.grant, { ...input.requestContext, operation });
	if (!authorization.allowed) return { accepted: false, reason: authorization.reason };
	if (forbiddenBrowserSecret(input.browserRequest)) return { accepted: false, reason: "secret_present" };

	const parsed = FlowDocumentSaveV1InputSchema.safeParse(input.browserRequest.body);
	if (!parsed.success || parsed.data.engine !== "langflow") {
		return { accepted: false, reason: "invalid_document" };
	}
	if (parsed.data.componentManifestHash !== flowV1Digest) {
		return { accepted: false, reason: "manifest_mismatch" };
	}
	if (graphShape === "synthetic" && !EditorGraphDocumentSchema.safeParse(parsed.data.graphDocument).success) {
		return { accepted: false, reason: "invalid_document" };
	}
	if (graphShape === "langflow") {
		const graphDocument = LangflowGraphDocumentSchema.safeParse(parsed.data.graphDocument);
		if (!graphDocument.success) return { accepted: false, reason: "invalid_document" };
		if (!matchesPinnedLangflowComponentAuthority(graphDocument.data)) {
			return { accepted: false, reason: "component_authority_mismatch" };
		}
	}
	if (parsed.data.flow !== input.grant.flowId) {
		return { accepted: false, reason: "flow_mismatch" };
	}
	if (parsed.data.expectedVersion !== input.grant.revision) {
		return { accepted: false, reason: "revision_mismatch" };
	}
	if (parsed.data.expectedVersion !== input.currentRevision) {
		return { accepted: false, reason: "version_conflict" };
	}
	return { accepted: true, request: parsed.data, nextRevision: input.currentRevision + 1 };
}

export const evaluateSaveGateway = (input: SaveGatewayInput) => evaluateSaveGatewayInput(input, "langflow");

export const evaluateSyntheticSaveGateway = (input: SaveGatewayInput) => evaluateSaveGatewayInput(input, "synthetic");

export type BrowserDraft = {
	generation: number;
	document: unknown;
};

export function applySaveAcknowledgement(input: {
	draft: BrowserDraft;
	submittedGeneration: number;
}): BrowserDraft | null {
	return input.draft.generation === input.submittedGeneration ? null : input.draft;
}
