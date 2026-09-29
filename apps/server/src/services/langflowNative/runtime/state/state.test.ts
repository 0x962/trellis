import { afterEach, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { systemContext } from "../../../../context";
import { createCache } from "../../../../db/cache";
import { recordCompletion, reserveNative } from "../../../../db/queries/langflowExecution";
import { now, receiptFixture } from "../../../../db/queries/langflowExecution/fixtures/fixture";
import { langflowCompletions, langflowExecutions, langflowOutbox } from "../../../../db/tables/langflowExecution";
import { runtimeAcknowledge } from "../acknowledge";
import { completionFixture } from "../fixture";
import { runtimeState } from "./state";

const opened: Awaited<ReturnType<typeof receiptFixture>>["db"][] = [];
afterEach(async () => {
	for (const db of opened.splice(0)) await db.$client.close();
});

async function fixture() {
	const { db, authority } = await receiptFixture();
	opened.push(db);
	const f = completionFixture();
	const reserved = await db.transaction((tx) =>
		reserveNative(tx, {
			requestBytes: f.delivery.requestBytes,
			taskKey: "root/501/step/condition/51",
			handle: f.delivery.handle,
			authority,
			now,
		}),
	);
	await db.transaction((tx) =>
		recordCompletion(tx, {
			resultBytes: f.delivery.resultBytes,
			completion: { version: 1, provenance: reserved.provenance, handle: reserved.handle, result: f.result },
		}),
	);
	const ctx = {
		...systemContext(),
		now,
		cache: createCache(),
		actorCache: new Map<string, number>(),
		emit: () => undefined,
		dropBlobs: () => undefined,
		publicUrl: "http://127.0.0.1:49000",
	};
	const key = { hostId: authority.hostId, executionId: reserved.executionId, stepId: reserved.stepId };
	const acknowledgment = { ...key, requestBytes: f.delivery.requestBytes, waitBytes: f.waitBytes, receipt: f.receipt };
	return { ...f, db, ctx, key, acknowledgment };
}

test("acknowledgment and outbox receipt roll back together and exact replay survives", async () => {
	const f = await fixture();
	await expect(
		f.db.transaction(async (tx) => {
			await runtimeAcknowledge(f.ctx, tx, f.acknowledgment);
			throw new Error("rollback_boundary");
		}),
	).rejects.toThrow("rollback_boundary");
	expect((await f.db.select().from(langflowCompletions))[0]!.acceptance).toBeNull();
	for (let replay = 0; replay < 2; replay += 1)
		await f.db.transaction((tx) => runtimeAcknowledge(f.ctx, tx, f.acknowledgment));
	expect((await f.db.select().from(langflowCompletions))[0]!.acceptance).toEqual(f.receipt);
	expect((await f.db.select().from(langflowOutbox).where(eq(langflowOutbox.kind, "completion")))[0]!.receipt).toEqual(
		f.receipt,
	);
	expect(
		await f.db.transaction((tx) =>
			runtimeState(f.ctx, tx, {
				hostId: f.key.hostId,
				operation: "receipt",
				input: { executionId: f.key.executionId, completionId: f.receipt.completionId },
			}),
		),
	).toEqual(f.receipt);
});

test("cancellation prevents delivery while preserving the original completion for audit", async () => {
	const f = await fixture();
	await f.db
		.update(langflowExecutions)
		.set({
			cancelIntent: {
				version: 1,
				executionId: f.key.executionId,
				requestId: crypto.randomUUID(),
				actor: { kind: "human", name: "fixture" },
				expectedRevision: 1,
				requestedAt: now.toISOString(),
			},
		})
		.where(eq(langflowExecutions.executionId, f.key.executionId));
	expect(
		await f.db.transaction((tx) =>
			runtimeState(f.ctx, tx, {
				hostId: f.key.hostId,
				operation: "delivery",
				input: f.key,
			}),
		),
	).toBeNull();
	expect((await f.db.select().from(langflowCompletions))[0]!.resultBytes).toBe(f.delivery.resultBytes);
	expect((await f.db.select().from(langflowCompletions))[0]!.acceptance).toBeNull();
});

test("rejects a changed request, attempt, host, or caller without an acknowledgment", async () => {
	const f = await fixture();
	const wait = JSON.parse(f.waitBytes);
	for (const changed of [
		{ ...f.acknowledgment, requestBytes: `${f.delivery.requestBytes} ` },
		{ ...f.acknowledgment, hostId: "other-host" },
		{
			...f.acknowledgment,
			waitBytes: JSON.stringify({ ...wait, handle: { ...wait.handle, attemptId: crypto.randomUUID() } }),
		},
	])
		await expect(f.db.transaction((tx) => runtimeAcknowledge(f.ctx, tx, changed))).rejects.toThrow();
	await expect(
		f.db.transaction((tx) =>
			runtimeAcknowledge({ ...f.ctx, actor: { kind: "human", name: "fixture" } }, tx, f.acknowledgment),
		),
	).rejects.toThrow("langflow_internal_native_required");
	expect((await f.db.select().from(langflowCompletions))[0]!.acceptance).toBeNull();
});
