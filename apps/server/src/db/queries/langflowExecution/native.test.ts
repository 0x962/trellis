import { afterEach, expect, test } from "bun:test";
import type { Db } from "../../client";
import {
	protocolDigest,
	type NativeCompletionV1,
	type NativeResultV1,
	type TakeoverRequestV1,
	type TakeoverReceiptV1,
} from "../../../langflowContracts";
import { ids, now, receiptFixture } from "./fixtures/fixture";
import { handle, nativeRequest } from "./fixtures/native";
import { readProjectionFacts } from "./facts";
import { recordCompletion, reserveNative, updateNativeHandle } from "./native";
import { listPendingDeliveries } from "./outbox";
import { transferOwnership } from "./ownership";
let db: Db;
afterEach(async () => {
	await db.$client.close();
});
test("reserves one exact attempt and preserves nullable late identities", async () => {
	const fixture = await receiptFixture();
	db = fixture.db;
	const input = {
		requestBytes: JSON.stringify(nativeRequest),
		taskKey: "outer/501/step",
		handle,
		authority: fixture.authority,
		now,
	};
	const first = await db.transaction((tx) => reserveNative(tx, input));
	expect(first.handle.workspaceId).toBeNull();
	expect(
		await db.transaction((tx) => reserveNative(tx, { ...input, handle: { ...handle, stepId: "replacement" } })),
	).toEqual(first);
	await expect(
		db.transaction((tx) =>
			reserveNative(tx, {
				...input,
				requestBytes: JSON.stringify({ ...nativeRequest, requestId: crypto.randomUUID(), occurrenceKey: "renamed" }),
			}),
		),
	).rejects.toThrow("identity_conflict");
	const observed = { ...handle, workspaceId: "workspace", providerSessionId: "session", revision: 2 };
	await db.transaction((tx) =>
		updateNativeHandle(tx, { executionId: ids.execution, expectedRevision: 1, handle: observed }),
	);
	await expect(
		db.transaction((tx) =>
			updateNativeHandle(tx, {
				executionId: ids.execution,
				expectedRevision: 2,
				handle: { ...observed, providerSessionId: "other", revision: 3 },
			}),
		),
	).rejects.toThrow("native_handle_conflict");
});
test("commits result and outbox atomically and retains exact output bytes beyond old limits", async () => {
	const fixture = await receiptFixture();
	db = fixture.db;
	const reserved = await db.transaction((tx) =>
		reserveNative(tx, {
			requestBytes: JSON.stringify(nativeRequest),
			taskKey: "outer/501/step",
			handle,
			authority: fixture.authority,
			now,
		}),
	);
	const completeHandle = {
		...handle,
		workspaceId: "workspace",
		providerSessionId: "session",
		state: "succeeded" as const,
		revision: 2,
	};
	await db.transaction((tx) =>
		updateNativeHandle(tx, { executionId: ids.execution, expectedRevision: 1, handle: completeHandle }),
	);
	const output = `${"x".repeat(300001)}\r\n`;
	const result: NativeResultV1 = {
		version: 1,
		launchBinding: {
			executionId: ids.execution,
			publicationId: ids.publication,
			engineJobId: nativeRequest.engineJobId,
			engineEpoch: 1,
		},
		requestDigest: reserved.requestDigest,
		completionId: "completion-1",
		stepId: handle.stepId,
		agentRunId: handle.agentRunId,
		attemptId: handle.attemptId,
		providerSessionId: "session",
		promptReceiptId: handle.attemptId,
		resultId: "result-1",
		resultVersion: 1,
		output,
		outputHash: protocolDigest(output),
		artifactRefs: [],
		exitKind: "completed",
	};
	const completion: NativeCompletionV1 = {
		version: 1,
		provenance: reserved.provenance,
		handle: completeHandle,
		result,
	};
	const input = { resultBytes: ` ${JSON.stringify(result)}\n`, completion };
	await expect(
		db.transaction(async (tx) => {
			await recordCompletion(tx, input);
			throw new Error("abort");
		}),
	).rejects.toThrow("abort");
	expect(
		(await db.transaction((tx) => readProjectionFacts(tx, { executionId: ids.execution }))).native[0]!.completion,
	).toBeNull();
	const saved = await db.transaction((tx) => recordCompletion(tx, input));
	expect(await db.transaction((tx) => recordCompletion(tx, input))).toEqual(saved);
	await expect(
		db.transaction((tx) => recordCompletion(tx, { ...input, resultBytes: JSON.stringify(result) })),
	).rejects.toThrow("identity_conflict");
	const outbox = await db.transaction((tx) =>
		listPendingDeliveries(tx, { executionId: ids.execution, afterId: "", limit: 10000 }),
	);
	expect(outbox.find((row) => row.id === "completion-1")!.payloadBytes).toBe(input.resultBytes);
	expect(saved.completion.result.output).toBe(output);
});
test("takeover preserves provenance and rejects old authority for new effects", async () => {
	const fixture = await receiptFixture();
	db = fixture.db;
	const reserved = await db.transaction((tx) =>
		reserveNative(tx, {
			requestBytes: JSON.stringify(nativeRequest),
			taskKey: "outer/501/step",
			handle,
			authority: fixture.authority,
			now,
		}),
	);
	const request: TakeoverRequestV1 = {
		version: 1,
		executionId: ids.execution,
		requestId: crypto.randomUUID(),
		expectedOwnerId: "owner-1",
		expectedEpoch: 1,
		expectedRevision: 1,
		newOwnerId: "owner-2",
		supervisorObservationId: "observation-2",
		priorOwnerRevocationId: "revocation-1",
	};
	const requestBytes = JSON.stringify(request);
	const receipt: TakeoverReceiptV1 = {
		version: 1,
		request,
		requestDigest: protocolDigest(requestBytes),
		transferId: "transfer-1",
		committedAt: now.toISOString(),
		authority: {
			...fixture.authority,
			ownerId: "owner-2",
			engineEpoch: 2,
			ownershipRevision: 2,
			capabilityId: "capability-2",
		},
		admission: {
			state: "open",
			receipt: { ...nativeRequest.admissionReceipt, engineEpoch: 2, admissionId: "admission-2" },
		},
	};
	await db.transaction((tx) => transferOwnership(tx, { requestBytes, receipt }));
	expect(await db.transaction((tx) => transferOwnership(tx, { requestBytes, receipt }))).toEqual(receipt);
	expect(
		(await db.transaction((tx) => readProjectionFacts(tx, { executionId: ids.execution }))).native[0]!.provenance,
	).toEqual(reserved.provenance);
	await expect(
		db.transaction((tx) =>
			reserveNative(tx, {
				requestBytes: JSON.stringify({
					...nativeRequest,
					nodeId: "another",
					occurrenceKey: "another",
					requestId: crypto.randomUUID(),
				}),
				taskKey: "another/step",
				handle: { ...handle, stepId: "step-2", attemptId: crypto.randomUUID() },
				authority: fixture.authority,
				now,
			}),
		),
	).rejects.toThrow("authority_conflict");
});
