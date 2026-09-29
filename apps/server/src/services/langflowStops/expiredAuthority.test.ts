import { afterEach, expect, test } from "bun:test";
import {
	listPendingDeliveries,
	readExecution,
	readProjectionFacts,
	reserveNative,
	transferOwnership,
} from "../../db/queries/langflowExecution";
import { ids, now } from "../../db/queries/langflowExecution/fixtures/fixture";
import { handle } from "../../db/queries/langflowExecution/fixtures/native";
import { langflowOutbox } from "../../db/tables/langflowExecution";
import { protocolDigest, TakeoverReceiptV1Schema, type TakeoverRequestV1 } from "../../langflowContracts";
import { assertExecutionActive } from "./assertExecutionActive";
import { cancelView } from "./cancelView";
import { stopFixture } from "./testFixture";

let fixture: Awaited<ReturnType<typeof stopFixture>>;
afterEach(async () => fixture.db.$client.close());

test("expired cancellation retains its delivery and clocks through cancellation-only takeover", async () => {
	fixture = await stopFixture(true);
	const input = { executionId: ids.execution };
	const before = await fixture.run((tx) => readProjectionFacts(tx, input));
	await fixture.run((tx) => cancelView(fixture.core, tx, { id: ids.execution, expectedRevision: 1 }));
	const canceled = (await fixture.run((tx) => readExecution(tx, input)))!;
	expect(canceled.admission.state).toBe("closed");
	expect(canceled.submission.admission).toEqual(canceled.admission);
	const pendingInput = { ...input, afterId: "", afterKind: "", limit: 100 };
	const pending = await fixture.run((tx) => listPendingDeliveries(tx, pendingInput));
	expect(pending.map((row) => row.kind)).toEqual(["cancel"]);
	expect(pending[0]!.receipt).toBeNull();
	const outboxBefore = await fixture.run((tx) =>
		tx.select().from(langflowOutbox).orderBy(langflowOutbox.id, langflowOutbox.kind),
	);
	const recoveryAt = new Date(Date.parse(fixture.authority.expiresAt) + 3_600_000);
	expect(recoveryAt.getTime()).toBeGreaterThan(Date.parse(fixture.authority.expiresAt));
	const request: TakeoverRequestV1 = {
		version: 1,
		executionId: ids.execution,
		requestId: crypto.randomUUID(),
		expectedOwnerId: fixture.authority.ownerId,
		expectedEpoch: fixture.authority.engineEpoch,
		expectedRevision: fixture.authority.ownershipRevision,
		newOwnerId: "recovery-owner",
		supervisorObservationId: "recovery-observation",
		priorOwnerRevocationId: "recovery-revocation",
	};
	const requestBytes = JSON.stringify(request);
	const receipt = TakeoverReceiptV1Schema.parse({
		version: 1,
		request,
		requestDigest: protocolDigest(requestBytes),
		transferId: "cancel-recovery-transfer",
		committedAt: recoveryAt.toISOString(),
		authority: {
			...fixture.authority,
			ownerId: request.newOwnerId,
			engineEpoch: 2,
			ownershipRevision: 2,
			capabilityId: "cancel-recovery-grant",
			permissions: ["execution.cancel"],
			issuedAt: recoveryAt.toISOString(),
			expiresAt: new Date(recoveryAt.getTime() + 3_600_000).toISOString(),
		},
		admission: canceled.admission,
	});
	await fixture.run((tx) => transferOwnership(tx, { requestBytes, receipt }));
	expect(await fixture.run((tx) => transferOwnership(tx, { requestBytes, receipt }))).toEqual(receipt);
	const recovered = (await fixture.run((tx) => readExecution(tx, input)))!;
	expect(recovered.cancelIntent).toEqual(canceled.cancelIntent);
	expect(recovered.engineJobId).toBe(canceled.engineJobId);
	expect(recovered.admission).toEqual(canceled.admission);
	const outboxAfter = await fixture.run((tx) =>
		tx.select().from(langflowOutbox).orderBy(langflowOutbox.id, langflowOutbox.kind),
	);
	expect(outboxAfter).toEqual(outboxBefore);
	const retry = await fixture.run((tx) => listPendingDeliveries(tx, pendingInput));
	expect(retry).toHaveLength(1);
	expect(retry[0]!.payloadBytes).toBe(pending[0]!.payloadBytes);
	expect(retry[0]!.receipt).toBeNull();
	expect(retry[0]!.authority).toEqual(receipt.authority);
	const after = await fixture.run((tx) => readProjectionFacts(tx, input));
	expect(after.deadlines).toEqual(before.deadlines);
	expect(after.native[0]!.launchReceipt).toEqual(before.native[0]!.launchReceipt);
	expect(after.stops[0]!.state).toBe("pending");
	expect(after.stops[0]!.attemptId).toBe(handle.attemptId);
	await expect(fixture.run((tx) => assertExecutionActive(fixture.core, tx, input))).rejects.toThrow("canceled");
	await expect(
		fixture.run((tx) =>
			reserveNative(tx, {
				requestBytes: JSON.stringify({
					...fixture.request,
					requestId: crypto.randomUUID(),
					nodeId: "new-node",
					occurrenceKey: "new",
					engineEpoch: receipt.authority.engineEpoch,
					admissionReceipt: { ...fixture.request.admissionReceipt, engineEpoch: receipt.authority.engineEpoch },
				}),
				taskKey: "new/step",
				handle: { ...handle, stepId: "new-step", attemptId: crypto.randomUUID() },
				authority: receipt.authority,
				now: new Date(now.getTime() + 7_200_000),
			}),
		),
	).rejects.toThrow("authority_conflict");
}, 60_000);
