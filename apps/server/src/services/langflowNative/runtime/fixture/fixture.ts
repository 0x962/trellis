import { authority, ids } from "../../../../db/queries/langflowExecution/fixtures/fixture";
import { handle, nativeRequest } from "../../../../db/queries/langflowExecution/fixtures/native";
import { type CompletionReceiptV1, type NativeResultV1, protocolDigest } from "../../../../langflowContracts";
import { createEngineClient, type EngineFetch } from "../../../../langflowHost/engineClient";
import type { NativeDelivery, NativeRuntimeRow } from "../contracts";

export function completionFixture() {
	const engineWaitId = "00000000-0000-4000-8000-000000000099";
	const requestBytes = ` ${JSON.stringify(nativeRequest)}\r\n`;
	const nativeHandle = { ...handle, state: "succeeded" as const, providerSessionId: "provider-original" };
	const result: NativeResultV1 = {
		version: 1,
		launchBinding: {
			executionId: ids.execution,
			publicationId: ids.publication,
			engineJobId: nativeRequest.engineJobId,
			engineEpoch: 1,
		},
		requestDigest: protocolDigest(requestBytes),
		completionId: "completion-original",
		stepId: handle.stepId,
		agentRunId: handle.agentRunId,
		attemptId: handle.attemptId,
		providerSessionId: nativeHandle.providerSessionId,
		promptReceiptId: handle.attemptId,
		resultId: "result-original",
		resultVersion: 1,
		output: "YES\n",
		outputHash: protocolDigest("YES\n"),
		artifactRefs: [],
		exitKind: "completed",
	};
	const resultBytes = `\n${JSON.stringify(result)}\n`;
	const currentAuthority = { ...authority, engineEpoch: 2, ownershipRevision: 2, ownerId: "owner-new" };
	const authorityBytes = ` ${JSON.stringify(currentAuthority)}\n`;
	const delivery: NativeDelivery = {
		requestBytes,
		resultBytes,
		authority: currentAuthority,
		handle: nativeHandle,
		deliveryBytes: JSON.stringify({
			version: 1,
			result,
			resultDigest: protocolDigest(resultBytes),
			authority: currentAuthority,
		}),
	};
	const waitBytes = JSON.stringify({ kind: "native", waitId: engineWaitId, request: nativeRequest, handle });
	const receipt: CompletionReceiptV1 = {
		version: 1,
		executionId: ids.execution,
		engineJobId: nativeRequest.engineJobId,
		completionId: result.completionId,
		resultDigest: protocolDigest(resultBytes),
		engineWaitId,
		continuationReceiptId: "continuation-original",
		acceptedAt: "2026-09-29T06:10:00Z",
	};
	const row: NativeRuntimeRow = {
		executionId: ids.execution,
		stepId: handle.stepId,
		handle: nativeHandle,
		requestBytes,
		authority: currentAuthority,
		canceled: false,
		admissionOpen: true,
		observe: true,
		completionId: null,
	};
	function client(fetcher: EngineFetch) {
		return createEngineClient({
			endpoint: "http://127.0.0.1:49000",
			authenticationFile: "/fixture/private-token",
			dependencies: { fetch: fetcher, readAuthenticationFile: async () => "fixture-engine-token" },
		});
	}
	function lookup(completed: boolean) {
		return {
			version: 1,
			engineJobId: nativeRequest.engineJobId,
			engineWaitId,
			waitBytes,
			state: completed ? "completed" : "waiting",
			resultBytes: completed ? resultBytes : null,
			receiptBytes: completed ? JSON.stringify(receipt) : null,
		};
	}
	return {
		row,
		delivery,
		result,
		authorityBytes,
		waitBytes,
		receipt,
		client,
		lookup,
		visit: {
			engineNodeId: "engine-vertex",
			requestBytes,
			engineWaitId,
			waitBytes,
			occurrence: {
				nodeId: nativeRequest.nodeId,
				occurrenceKey: nativeRequest.occurrenceKey,
				parentOccurrenceKey: nativeRequest.parentOccurrenceKey,
				phase: nativeRequest.phase,
				iterationPath: nativeRequest.iterationPath,
			},
			scope: {
				inputReceiptIds: nativeRequest.inputReceiptIds,
				groupDeadlineRefs: nativeRequest.groupDeadlineRefs,
				deadlineAt: nativeRequest.deadlineAt,
			},
			admissionReceipt: nativeRequest.admissionReceipt,
			inputReceipts: [],
		},
	};
}
