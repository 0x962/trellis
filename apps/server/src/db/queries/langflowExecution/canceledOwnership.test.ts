import { afterEach, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { protocolDigest, type RenewalReceiptV1, type TakeoverReceiptV1 } from "../../../langflowContracts";
import type { Db } from "../../client";
import { langflowExecutions, langflowOutbox, langflowOwnershipReceipts } from "../../tables/langflowExecution";
import { readExecution } from "./executions";
import { admission, type authority, ids, now, receiptFixture } from "./fixtures/fixture";
import { transferOwnership } from "./ownership";
import { cancelExecution } from "./stops";

let db: Db;
afterEach(async () => db.$client.close());
const execution = { executionId: ids.execution };
function receiptFor(current: typeof authority, takeover: boolean, canceled: boolean) {
	const common = {
		version: 1 as const,
		executionId: ids.execution,
		requestId: crypto.randomUUID(),
		expectedRevision: current.ownershipRevision,
		supervisorObservationId: "observation-2",
	};
	const next = {
		...current,
		ownershipRevision: current.ownershipRevision + 1,
		capabilityId: "capability-2",
		permissions: canceled ? (["execution.cancel"] as typeof current.permissions) : current.permissions,
	};
	if (takeover) {
		const request = {
			...common,
			expectedOwnerId: current.ownerId,
			expectedEpoch: current.engineEpoch,
			newOwnerId: "owner-2",
			priorOwnerRevocationId: "revocation-1",
		};
		const requestBytes = JSON.stringify(request);
		const receipt: TakeoverReceiptV1 = {
			version: 1,
			request,
			requestDigest: protocolDigest(requestBytes),
			transferId: "transfer-1",
			committedAt: now.toISOString(),
			authority: { ...next, ownerId: request.newOwnerId, engineEpoch: current.engineEpoch + 1 },
			admission: { state: "open", receipt: { ...admission, admissionId: "admission-2", engineEpoch: 2 } },
		};
		return { requestBytes, receipt };
	}
	const request = { ...common, ownerId: current.ownerId, engineEpoch: current.engineEpoch };
	const requestBytes = JSON.stringify(request);
	const receipt: RenewalReceiptV1 = {
		version: 1,
		request,
		requestDigest: protocolDigest(requestBytes),
		renewalId: "renewal-1",
		authority: next,
	};
	return { requestBytes, receipt };
}
async function cancel() {
	const row = (await db.transaction((tx) => readExecution(tx, execution)))!;
	const intent = {
		version: 1 as const,
		...execution,
		requestId: crypto.randomUUID(),
		actor: { kind: "human" as const, name: "fixture" },
		expectedRevision: row.revision,
		requestedAt: now.toISOString(),
	};
	await db.transaction((tx) => cancelExecution(tx, { intent, obligations: [] }));
	return intent;
}
for (const takeover of [false, true]) {
	test(`${takeover ? "takeover" : "renewal"} keeps cancellation closed and rejects cached broad grants`, async () => {
		const fixture = await receiptFixture();
		db = fixture.db;
		const broad = receiptFor(fixture.authority, takeover, false);
		await db.transaction((tx) => transferOwnership(tx, broad));
		const intent = await cancel();
		const row = (await db.transaction((tx) => readExecution(tx, execution)))!;
		expect(row.admission).toEqual({ state: "closed", barrierId: intent.requestId });
		expect(row.submission.admission).toEqual(row.admission);
		await expect(db.transaction((tx) => transferOwnership(tx, broad))).rejects.toThrow(
			"cancellation_requires_successor_authority",
		);
		const narrow = receiptFor(row.authority!, takeover, true);
		if ("transferId" in narrow.receipt) {
			narrow.receipt.transferId = "transfer-2";
			narrow.receipt.request.newOwnerId = "owner-3";
			narrow.receipt.authority.ownerId = "owner-3";
			narrow.requestBytes = JSON.stringify(narrow.receipt.request);
			narrow.receipt.requestDigest = protocolDigest(narrow.requestBytes);
			await expect(db.transaction((tx) => transferOwnership(tx, narrow))).rejects.toThrow("admission_conflict");
			narrow.receipt.admission = { state: "closed", barrierId: "different" };
			await expect(db.transaction((tx) => transferOwnership(tx, narrow))).rejects.toThrow("admission_conflict");
			narrow.receipt.admission = row.admission;
		} else narrow.receipt.renewalId = "renewal-2";
		const outbox = await db.select().from(langflowOutbox);
		await db.transaction((tx) => transferOwnership(tx, narrow));
		expect(await db.transaction((tx) => transferOwnership(tx, narrow))).toEqual(narrow.receipt);
		const after = (await db.transaction((tx) => readExecution(tx, execution)))!;
		expect(after.cancelIntent).toEqual(intent);
		expect(after.engineJobId).toBe(row.engineJobId);
		expect(after.admission).toEqual(row.admission);
		expect(after.submission.admission).toEqual(row.admission);
		expect(await db.select().from(langflowOutbox)).toEqual(outbox);
		expect(await db.select().from(langflowOwnershipReceipts)).toHaveLength(2);
		await db
			.update(langflowExecutions)
			.set({ admission: fixture.input.admission, submission: row.submission })
			.where(eq(langflowExecutions.executionId, ids.execution));
		await expect(db.transaction((tx) => transferOwnership(tx, narrow))).rejects.toThrow("canceled_admission_open");
	});
}
test("cancellation rolls back every admission field and preserves an existing closed barrier", async () => {
	({ db } = await receiptFixture(false));
	const before = (await db.transaction((tx) => readExecution(tx, execution)))!;
	const intent = {
		version: 1 as const,
		...execution,
		requestId: crypto.randomUUID(),
		actor: { kind: "human" as const, name: "fixture" },
		expectedRevision: before.revision,
		requestedAt: now.toISOString(),
	};
	await expect(
		db.transaction(async (tx) => {
			await cancelExecution(tx, { intent, obligations: [] });
			throw new Error("abort");
		}),
	).rejects.toThrow("abort");
	expect(await db.transaction((tx) => readExecution(tx, execution))).toEqual(before);
	expect(await db.select().from(langflowOutbox)).toHaveLength(0);
	await db.transaction((tx) => cancelExecution(tx, { intent, obligations: [] }));
	expect(await db.transaction((tx) => cancelExecution(tx, { intent, obligations: [] }))).toEqual(intent);
	const after = (await db.transaction((tx) => readExecution(tx, execution)))!;
	expect(after.admission).toEqual(before.admission);
	expect(after.submission.admission).toEqual(before.admission);
	expect(after.revision).toBe(before.revision + 1);
	expect(after.submission.revision).toBe(before.submission.revision + 1);
	expect(await db.select().from(langflowOutbox)).toHaveLength(1);
});
