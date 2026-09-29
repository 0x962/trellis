import { afterEach, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { ids, now, receiptFixture } from "../../../db/queries/langflowExecution/fixtures/fixture";
import { handle, nativeRequest } from "../../../db/queries/langflowExecution/fixtures/native";
import { reserveNative } from "../../../db/queries/langflowExecution/native";
import { cancelExecution, recordStop, updateStop } from "../../../db/queries/langflowExecution/stops";
import { langflowNativeHandles } from "../../../db/tables/langflowExecution";
import type { StopObligationV1 } from "../../../langflowContracts";
import { readNativeRequest } from "./readNativeRequest";

const databases: Awaited<ReturnType<typeof receiptFixture>>["db"][] = [];
afterEach(async () => {
	for (const db of databases.splice(0)) await db.$client.close();
});
const requestBytes = JSON.stringify(nativeRequest);
const intent = {
	version: 1 as const,
	executionId: ids.execution,
	requestId: crypto.randomUUID(),
	expectedRevision: 2,
	requestedAt: now.toISOString(),
	actor: { kind: "human" as const, name: "fixture" },
};
const stop: StopObligationV1 = {
	version: 1,
	obligationId: "stop-1",
	executionId: ids.execution,
	stepId: handle.stepId,
	agentRunId: handle.agentRunId,
	attemptId: handle.attemptId,
	reason: "canceled",
	requestedAt: now.toISOString(),
	revision: 1,
	state: "pending",
	exitReceipt: null,
};
async function fixture(reserved = false) {
	const { db, authority } = await receiptFixture();
	databases.push(db);
	if (reserved)
		await db.transaction((tx) => reserveNative(tx, { requestBytes, taskKey: "task", handle, authority, now }));
	const ctx = { now, nativeAuthority: authority };
	return { db, ctx, read: () => db.transaction((tx) => readNativeRequest(ctx, tx, { requestBytes })) };
}

test("distinguishes active absence from durable canceled absence without a reservation", async () => {
	const f = await fixture();
	expect(await f.read()).toMatchObject({ state: "absent", reconciliation: "pending", cancelIntent: null });
	await f.db.transaction((tx) => cancelExecution(tx, { intent, obligations: [] }));
	expect(await f.read()).toMatchObject({ state: "absent", reconciliation: "cancelled_absent", cancelIntent: intent });
	expect(await f.db.select().from(langflowNativeHandles)).toHaveLength(0);
});

test("retains exact attempts until a matching saved exit confirms the stop", async () => {
	const f = await fixture(true);
	expect(await f.read()).toMatchObject({ state: "reserved", handle, stop: null, reconciliation: "pending" });
	await f.db.transaction((tx) => cancelExecution(tx, { intent, obligations: [stop] }));
	expect(await f.read()).toMatchObject({ handle, stop, reconciliation: "pending" });
	const confirmed: StopObligationV1 = {
		...stop,
		state: "confirmed",
		revision: 2,
		exitReceipt: {
			attemptId: handle.attemptId,
			receiptId: "exit-1",
			exitedAt: now.toISOString(),
			confirmedAt: now.toISOString(),
		},
	};
	await f.db.transaction((tx) => updateStop(tx, { expectedRevision: 1, obligation: confirmed }));
	expect(await f.read()).toMatchObject({ handle, stop: confirmed, reconciliation: "exited" });
});

test("rejects byte changes, semantic aliases, forged authority, and a different admission", async () => {
	const f = await fixture(true);
	for (const changed of [
		`${requestBytes}\n`,
		JSON.stringify({ ...nativeRequest, requestId: crypto.randomUUID(), occurrenceKey: "alias" }),
	])
		await expect(f.db.transaction((tx) => readNativeRequest(f.ctx, tx, { requestBytes: changed }))).rejects.toThrow(
			"identity_conflict",
		);
	await expect(
		f.db.transaction((tx) =>
			readNativeRequest({ ...f.ctx, nativeAuthority: { ...f.ctx.nativeAuthority, capabilityId: "forged" } }, tx, {
				requestBytes,
			}),
		),
	).rejects.toThrow("authority_conflict");
	await expect(
		f.db.transaction((tx) =>
			readNativeRequest(f.ctx, tx, {
				requestBytes: JSON.stringify({
					...nativeRequest,
					admissionReceipt: { ...nativeRequest.admissionReceipt, admissionId: "other" },
				}),
			}),
		),
	).rejects.toThrow("native_request_binding_conflict");
});

test("refuses stop proof that belongs to another run", async () => {
	const f = await fixture(true);
	await f.db.transaction((tx) => recordStop(tx, { obligation: stop }));
	await f.db
		.update(langflowNativeHandles)
		.set({ agentRunId: "another-run" })
		.where(eq(langflowNativeHandles.stepId, handle.stepId));
	await expect(f.read()).rejects.toThrow("stop_attempt_conflict");
});
