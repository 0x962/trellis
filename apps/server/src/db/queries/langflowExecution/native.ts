import { isDeepStrictEqual } from "node:util";
import { and, eq, or } from "drizzle-orm";
import {
	NativeRequestV1Schema,
	NativeResultV1Schema,
	protocolDigest,
	readProtocolBytes,
	type DeliveryAuthorityV1,
	type NativeCompletionV1,
	type NativeHandleV1,
	type NativeLaunchReceiptV1,
	type CompletionReceiptV1,
} from "../../../langflowContracts";
import {
	langflowNativeHandles as handles,
	langflowCompletions as completions,
	langflowOutbox,
} from "../../tables/langflowExecution";
import type { Tx } from "../../tx";
import { assertAuthority, lockExecution } from "./executions";

export async function reserveNative(
	tx: Tx,
	input: { requestBytes: string; taskKey: string; handle: NativeHandleV1; authority: DeliveryAuthorityV1; now: Date },
) {
	const request = readProtocolBytes(NativeRequestV1Schema, input.requestBytes);
	const execution = await lockExecution(tx, request);
	const semanticKey = JSON.stringify([
		request.nodeId,
		request.parentOccurrenceKey,
		request.phase,
		request.iterationPath.map((v) => [v.loopNodeId, v.round]),
	]);
	const [existing] = await tx
		.select()
		.from(handles)
		.where(
			and(
				eq(handles.executionId, request.executionId),
				or(
					eq(handles.semanticKey, semanticKey),
					eq(handles.requestId, request.requestId),
					eq(handles.occurrenceKey, request.occurrenceKey),
				),
			),
		);
	if (existing) {
		if (existing.requestBytes !== input.requestBytes || existing.taskKey !== input.taskKey)
			throw new Error("identity_conflict");
		return existing;
	}
	assertAuthority(execution, input.authority, "native.reserve", input.now);
	if (
		execution.cancelIntent ||
		execution.admission.state !== "open" ||
		!isDeepStrictEqual(execution.admission.receipt, request.admissionReceipt)
	)
		throw new Error("admission_closed");
	const requestDigest = protocolDigest(input.requestBytes);
	const provenance = {
		version: 1 as const,
		request,
		requestDigest,
		stepId: input.handle.stepId,
		agentRunId: input.handle.agentRunId,
		attemptId: input.handle.attemptId,
		reservedAt: input.now.toISOString(),
	};
	const [saved] = await tx
		.insert(handles)
		.values({
			stepId: input.handle.stepId,
			executionId: request.executionId,
			taskKey: input.taskKey,
			semanticKey,
			occurrenceKey: request.occurrenceKey,
			requestId: request.requestId,
			agentRunId: input.handle.agentRunId,
			attemptId: input.handle.attemptId,
			requestBytes: input.requestBytes,
			requestDigest,
			provenance,
			handle: input.handle,
		})
		.returning();
	return saved!;
}
export async function updateNativeHandle(
	tx: Tx,
	input: { executionId: string; expectedRevision: number; handle: NativeHandleV1 },
) {
	await lockExecution(tx, input);
	const [row] = await tx
		.select()
		.from(handles)
		.where(and(eq(handles.executionId, input.executionId), eq(handles.stepId, input.handle.stepId)));
	if (
		!row ||
		row.handle.revision !== input.expectedRevision ||
		input.handle.revision !== input.expectedRevision + 1 ||
		row.agentRunId !== input.handle.agentRunId ||
		row.attemptId !== input.handle.attemptId ||
		(row.handle.workspaceId !== null && row.handle.workspaceId !== input.handle.workspaceId) ||
		(row.handle.providerSessionId !== null && row.handle.providerSessionId !== input.handle.providerSessionId)
	)
		throw new Error("native_handle_conflict");
	await tx.update(handles).set({ handle: input.handle }).where(eq(handles.stepId, input.handle.stepId));
	return input.handle;
}
export async function recordLaunch(tx: Tx, input: { executionId: string; receipt: NativeLaunchReceiptV1 }) {
	await lockExecution(tx, input);
	const [row] = await tx
		.select()
		.from(handles)
		.where(and(eq(handles.executionId, input.executionId), eq(handles.stepId, input.receipt.stepId)));
	if (!row || row.attemptId !== input.receipt.attemptId) throw new Error("launch_conflict");
	if (row.launchReceipt) {
		if (!isDeepStrictEqual(row.launchReceipt, input.receipt)) throw new Error("identity_conflict");
		return row.launchReceipt;
	}
	await tx.update(handles).set({ launchReceipt: input.receipt }).where(eq(handles.stepId, row.stepId));
	return input.receipt;
}
export async function recordCompletion(tx: Tx, input: { resultBytes: string; completion: NativeCompletionV1 }) {
	const result = readProtocolBytes(NativeResultV1Schema, input.resultBytes);
	await lockExecution(tx, result.launchBinding);
	const [existing] = await tx
		.select()
		.from(completions)
		.where(
			or(
				eq(completions.completionId, result.completionId),
				and(
					eq(completions.attemptId, result.attemptId),
					eq(completions.resultId, result.resultId),
					eq(completions.resultVersion, result.resultVersion),
				),
			),
		);
	if (existing) {
		if (existing.resultBytes !== input.resultBytes) throw new Error("identity_conflict");
		return existing;
	}
	const [reserved] = await tx.select().from(handles).where(eq(handles.stepId, result.stepId));
	if (
		!reserved ||
		!isDeepStrictEqual(reserved.provenance, input.completion.provenance) ||
		!isDeepStrictEqual(result, input.completion.result) ||
		!isDeepStrictEqual(input.completion.handle, reserved.handle) ||
		result.agentRunId !== reserved.agentRunId ||
		result.launchBinding.executionId !== reserved.executionId ||
		result.launchBinding.publicationId !== reserved.provenance.request.publicationId ||
		result.launchBinding.engineJobId !== reserved.provenance.request.engineJobId ||
		result.launchBinding.engineEpoch !== reserved.provenance.request.engineEpoch ||
		reserved.attemptId !== result.attemptId ||
		reserved.handle.providerSessionId !== result.providerSessionId ||
		result.promptReceiptId !== reserved.attemptId ||
		result.requestDigest !== reserved.requestDigest
	)
		throw new Error("completion_conflict");
	const resultDigest = protocolDigest(input.resultBytes);
	const [saved] = await tx
		.insert(completions)
		.values({
			completionId: result.completionId,
			executionId: result.launchBinding.executionId,
			stepId: result.stepId,
			attemptId: result.attemptId,
			resultId: result.resultId,
			resultVersion: result.resultVersion,
			resultBytes: input.resultBytes,
			resultDigest,
			completion: input.completion,
		})
		.returning();
	await tx.insert(langflowOutbox).values({
		id: result.completionId,
		executionId: result.launchBinding.executionId,
		kind: "completion",
		payloadBytes: input.resultBytes,
	});
	return saved!;
}
export async function confirmCompletion(tx: Tx, input: { receipt: CompletionReceiptV1 }) {
	await lockExecution(tx, input.receipt);
	const [row] = await tx.select().from(completions).where(eq(completions.completionId, input.receipt.completionId));
	if (
		!row ||
		row.resultDigest !== input.receipt.resultDigest ||
		row.executionId !== input.receipt.executionId ||
		row.completion.result.launchBinding.engineJobId !== input.receipt.engineJobId
	)
		throw new Error("completion_receipt_conflict");
	if (row.acceptance && !isDeepStrictEqual(row.acceptance, input.receipt)) throw new Error("identity_conflict");
	await tx.update(completions).set({ acceptance: input.receipt }).where(eq(completions.completionId, row.completionId));
	await tx.update(langflowOutbox).set({ receipt: input.receipt }).where(eq(langflowOutbox.id, row.completionId));
	return input.receipt;
}
