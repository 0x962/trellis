import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { workspaceOperation } from "../../../agents/native/workspaceOperation";
import { bindLaunchSnapshot, reserveNative } from "../../../db/queries/langflowExecution";
import { ids, now, receiptFixture } from "../../../db/queries/langflowExecution/fixtures/fixture";
import { handle, nativeRequest } from "../../../db/queries/langflowExecution/fixtures/native";
import type { Tx } from "../../../db/tx";
import { protocolDigest } from "../../../langflowContracts";
import { DispatchGate, LangflowHostControl } from "../../../langflowHost";
import { withAttemptOperation } from "../../langflowStops/withAttemptOperation";
import { writeLaunchSnapshot } from "../launchSnapshot";
import { runtimeFixture } from "../runtimeFixture";
import { withNativeReconciliation } from "./withNativeReconciliation";

const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
	for (const cleanup of cleanups.splice(0)) await cleanup();
});
async function fixture(snapshot = true) {
	const { db, authority } = await receiptFixture();
	const home = await mkdtemp(join(tmpdir(), "trellis-native-reconciliation-"));
	const controlDirectory = LangflowHostControl.directory(home);
	cleanups.push(
		() => db.$client.close(),
		() => rm(home, { recursive: true, force: true }),
		() => rm(controlDirectory, { recursive: true, force: true }),
	);
	const control = LangflowHostControl.create({
		home,
		evidence: {
			readTerminal: async () => {
				throw new Error("unexpected_settle");
			},
			withReconciliation: async () => {
				throw new Error("unexpected_release");
			},
		},
	});
	await db.transaction((tx) =>
		reserveNative(tx, {
			requestBytes: JSON.stringify(nativeRequest),
			taskKey: "task",
			handle,
			authority,
			now,
		}),
	);
	if (snapshot) {
		const digest = await writeLaunchSnapshot(
			home,
			handle.attemptId,
			JSON.stringify({
				executionId: ids.execution,
				stepId: handle.stepId,
				requestDigest: protocolDigest(JSON.stringify(nativeRequest)),
				launch: { run: { id: handle.agentRunId }, attempt: { id: handle.attemptId, token: "private-fixture" } },
			}),
		);
		await db.transaction((tx) =>
			bindLaunchSnapshot(tx, {
				executionId: ids.execution,
				stepId: handle.stepId,
				attemptId: handle.attemptId,
				digest,
			}),
		);
	}
	const ctx = {
		home,
		control,
		newTx: <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn),
		withSnapshotRetention: <T>(path: string, action: () => Promise<T>) =>
			workspaceOperation(join(path, "fixture-retention"), action),
	};
	const block = control.gate.read().block!;
	const client = { inspect: async () => runtimeFixture(handle) };
	return { ctx, block, client };
}

test("holds the actual attempt lock through the callback without a database transaction", async () => {
	const f = await fixture();
	let writerRan = false;
	let writer: Promise<void> | undefined;
	const result = await withNativeReconciliation(
		f.ctx,
		{ block: f.block },
		async ({ manifest }) => {
			expect(manifest.ready).toBe(true);
			expect(JSON.stringify(manifest)).not.toContain("private-fixture");
			writer = withAttemptOperation(f.ctx.home, handle.attemptId, async () => {
				writerRan = true;
			});
			await f.ctx.newTx(async () => {
				expect(writerRan).toBe(false);
			});
			return "retained";
		},
		f.client,
	);
	await writer;
	expect(writerRan).toBe(true);
	expect(result).toEqual({ state: "completed", value: "retained" });
});

test("blocks missing snapshots and unknown attempts before the callback", async () => {
	const missing = await fixture(false);
	const unknown = await fixture();
	const corrupt = await fixture();
	await writeFile(join(corrupt.ctx.home, "harness-attempts", handle.attemptId, "langflow-launch.json"), "changed");
	const action = async () => {
		throw new Error("unexpected_callback");
	};
	expect(await withNativeReconciliation(missing.ctx, { block: missing.block }, action, missing.client)).toMatchObject({
		state: "blocked",
		reason: "snapshot_unavailable",
	});
	expect(await withNativeReconciliation(corrupt.ctx, { block: corrupt.block }, action, corrupt.client)).toMatchObject({
		state: "blocked",
		reason: "snapshot_unavailable",
	});
	expect(
		await withNativeReconciliation(unknown.ctx, { block: unknown.block }, action, {
			inspect: async () => ({ ...runtimeFixture(handle), status: "unknown" }),
		}),
	).toMatchObject({ state: "blocked", reason: "native_ownership_unknown" });
});

test("rejects a different block and a missing retention producer before the callback", async () => {
	const f = await fixture();
	const action = async () => {
		throw new Error("unexpected_callback");
	};
	await expect(
		withNativeReconciliation(f.ctx, { block: { ...f.block, generation: f.block.generation + 1 } }, action, f.client),
	).rejects.toThrow("native_reconciliation_block_conflict");
	await expect(
		withNativeReconciliation(
			{
				...f.ctx,
				withSnapshotRetention: async () => {
					throw new Error("retention_unavailable");
				},
			},
			{ block: f.block },
			action,
			f.client,
		),
	).rejects.toThrow("retention_unavailable");
});

test("keeps the scope closed while an effect lacks terminal evidence", async () => {
	const f = await fixture();
	const gate = DispatchGate.create({
		directory: join(f.ctx.home, "pending-gate"),
		dataHomeId: f.ctx.control.identity.dataHomeId,
		evidence: {
			readTerminal: async () => {
				throw new Error("unexpected_settle");
			},
			withReconciliation: async () => {
				throw new Error("unexpected_release");
			},
		},
	});
	gate.acquire({
		effectId: "pending",
		kind: "native-dispatch",
		executionId: ids.execution,
		attemptId: handle.attemptId,
		jobId: nativeRequest.engineJobId,
		requestId: nativeRequest.requestId,
		payloadDigest: protocolDigest(JSON.stringify(nativeRequest)),
	});
	const block = gate.closeDispatch({ requestId: "capture", reason: { kind: "capture", snapshotId: "capture" } });
	const ctx = { ...f.ctx, control: { identity: f.ctx.control.identity, gate } };
	await expect(
		withNativeReconciliation(
			ctx,
			{ block },
			async () => {
				throw new Error("unexpected_callback");
			},
			f.client,
		),
	).rejects.toThrow("native_reconciliation_effect_pending");
});
