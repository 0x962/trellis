import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { ids, now, receiptFixture } from "../../../db/queries/langflowExecution/fixtures/fixture";
import { handle, nativeRequest } from "../../../db/queries/langflowExecution/fixtures/native";
import { recordLaunch, reserveNative } from "../../../db/queries/langflowExecution/native";
import { langflowNativeHandles } from "../../../db/tables/langflowExecution";
import type { Tx } from "../../../db/tx";
import { protocolDigest } from "../../../langflowContracts";
import { DispatchGate, DispatchReceiptArchive, type EffectBinding } from "../../../langflowHost";
import { readNativeDispatchEvidence } from "../readNativeDispatchEvidence";
import { createNativeDispatchGate } from "./createNativeDispatchGate";

const databases: Awaited<ReturnType<typeof receiptFixture>>["db"][] = [];
const roots: string[] = [];
afterEach(async () => {
	for (const db of databases.splice(0)) await db.$client.close();
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const requestBytes = JSON.stringify(nativeRequest);
const binding: EffectBinding = {
	effectId: `native-reservation:${ids.execution}:${nativeRequest.requestId}`,
	kind: "native-dispatch",
	executionId: ids.execution,
	attemptId: null,
	jobId: nativeRequest.engineJobId,
	requestId: nativeRequest.requestId,
	payloadDigest: protocolDigest(requestBytes),
};
const launchBinding = {
	...binding,
	attemptId: handle.attemptId,
	effectId: `native-launch:${handle.stepId}:${handle.attemptId}`,
};
const launch = {
	version: 1 as const,
	launchReceiptId: "launch-1",
	stepId: handle.stepId,
	attemptId: handle.attemptId,
	launchedAt: now.toISOString(),
	recordedAt: now.toISOString(),
	groupDeadlines: [],
};
async function fixture() {
	const { db, authority } = await receiptFixture();
	databases.push(db);
	await db.transaction((tx) => reserveNative(tx, { requestBytes, taskKey: "task", handle, authority, now }));
	const root = mkdtempSync(join(tmpdir(), "trellis-native-evidence-"));
	roots.push(root);
	const home = join(root, "home");
	mkdirSync(home);
	const dataHomeId = crypto.randomUUID();
	let archive: DispatchReceiptArchive;
	const gate = DispatchGate.create({
		directory: join(root, "gate"),
		dataHomeId,
		evidence: {
			readTerminal: (permit, id) => archive.readTerminal(permit, id),
			withReconciliation: async () => {
				throw new Error("unexpected_restore");
			},
		},
	});
	archive = DispatchReceiptArchive.open({
		identity: { version: 1, home, hostId: crypto.randomUUID(), dataHomeId },
		gate,
	});
	const ctx = { dataHomeId, gate, archive, newTx: <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn) };
	return { db, ctx, gate, archive, native: createNativeDispatchGate(ctx) };
}

test("settles through archived committed bytes and preserves equal replay after handle changes", async () => {
	const f = await fixture();
	const permit = f.native.acquire(binding);
	await f.native.settle(permit, handle.stepId);
	const terminal = f.gate.read().permits[0]!.terminal!;
	expect(terminal.id).not.toBe(handle.stepId);
	expect(terminal.id).toMatch(/^[a-f0-9]{64}$/);
	const record = JSON.parse(f.archive.readRecordBytes(terminal.id));
	expect(JSON.parse(record.source.sourceBytes).requestBytes).toBe(requestBytes);
	expect(record.source.sourceDigest).toBe(protocolDigest(record.source.sourceBytes));
	await f.db
		.update(langflowNativeHandles)
		.set({ handle: { ...handle, state: "running", revision: 2 } })
		.where(eq(langflowNativeHandles.stepId, handle.stepId));
	await f.native.settle(permit, handle.stepId);
	expect(f.gate.read().permits[0]!.terminal).toEqual(terminal);
});

test("keeps an unknown launch pending until the exact launch receipt commits", async () => {
	const f = await fixture();
	const permit = f.native.acquire(launchBinding);
	await expect(f.native.settle(permit, launch.launchReceiptId)).rejects.toThrow("native_dispatch_evidence_unknown");
	expect(f.gate.read().permits[0]!.terminal).toBeNull();
	await f.db.transaction((tx) => recordLaunch(tx, { executionId: ids.execution, receipt: launch }));
	await f.native.settle(permit, launch.launchReceiptId);
	expect(f.gate.read().permits[0]!.terminal?.outcome).toBe("completed");
	const proof = await f.ctx.newTx((tx) => readNativeDispatchEvidence(f.ctx, tx, { permit }));
	expect(proof?.receiptId).toBe(launch.launchReceiptId);
});

test("refuses changed permit identity and a substituted receipt without settlement", async () => {
	const f = await fixture();
	const permit = f.native.acquire(binding);
	for (const changed of [
		{ ...permit, dataHomeId: "another-home" },
		{ ...permit, binding: { ...binding, jobId: "another-job" } },
		{ ...permit, binding: { ...binding, payloadDigest: "f".repeat(64) } },
		{ ...permit, binding: { ...binding, attemptId: crypto.randomUUID() } },
		{ ...permit, generation: permit.generation + 1 },
	])
		await expect(f.native.settle(changed, handle.stepId)).rejects.toThrow();
	await expect(f.native.settle(permit, "another-step")).rejects.toThrow("native_dispatch_receipt_conflict");
	expect(f.gate.read().permits[0]!.terminal).toBeNull();
});

test("a missing reservation cannot settle its saved permit", async () => {
	const f = await fixture();
	const permit = f.native.acquire(binding);
	await f.db.delete(langflowNativeHandles).where(eq(langflowNativeHandles.stepId, handle.stepId));
	await expect(f.native.settle(permit, handle.stepId)).rejects.toThrow("native_dispatch_evidence_unknown");
	expect(f.gate.read().permits[0]!.terminal).toBeNull();
});
