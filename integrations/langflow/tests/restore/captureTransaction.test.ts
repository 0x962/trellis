import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { RuntimeCaptureProducer, RuntimeCaptureRequest } from "@trellis/runtime-protocol";
import type { RuntimeClient } from "@trellis/runtime-protocol/client";
import type { Tx } from "../../../../apps/server/src/db/tx";
import { exportCapturedHistory } from "../../../../apps/server/src/services/langflowBackup/exportCapturedHistory";
import { manifestName } from "../../../../apps/server/src/services/langflowBackup/manifest";
import { readCaptureIdentities } from "../../../../apps/server/src/services/langflowBackup/readCaptureIdentities";
import type { CaptureRecords } from "../../../../apps/server/src/services/langflowBackup/readCaptureRecords";
import { sealSnapshot } from "../../../../apps/server/src/services/langflowBackup/sealSnapshot";
import { withCaptureTransaction } from "../../../../apps/server/src/services/langflowBackup/withCaptureTransaction";
import { fixture as snapshotFixture } from "./fixture";

function fixture() {
	const events: string[] = [];
	const controller = new AbortController();
	const controls = { afterCommit: () => {}, finalizationError: undefined as Error | undefined };
	let transaction = false;
	let held = false;
	const request: RuntimeCaptureRequest = { captureId: "capture", snapshotId: "snapshot", hostId: "host", dataHomeId: "home", generation: 1, blockId: "block", identities: [] };
	const producer: RuntimeCaptureProducer = {
		signal: controller.signal,
		binding: { ...request, roots: [], workspaces: [] },
		async inventory(binding) { return { binding, entries: [], unavailable: [] }; },
		async *read() { yield* []; throw new Error("unexpected_read"); },
		async seal() { throw new Error("unexpected_seal"); },
	};
	const runtime: Pick<RuntimeClient, "withCaptureSnapshot"> = {
		async withCaptureSnapshot(actual, consume) {
			expect(actual).toEqual(request);
			expect(transaction).toBe(false);
			events.push("acquire");
			held = true;
			try {
				const result = await consume(producer);
				expect(transaction).toBe(false);
				if (controls.finalizationError) throw controls.finalizationError;
				held = false;
				events.push("finalized");
				const receipt = {
					schemaVersion: 1 as const, kind: "trellis-runtime-capture-finalization" as const,
					request: actual, requestSha256: createHash("sha256").update(JSON.stringify(actual)).digest("hex"),
					outcome: "committed" as const, finalizedAt: "2026-09-30T00:00:00.000Z",
				};
				return { value: result, finalization: { receipt, receiptBytes: JSON.stringify(receipt) } };
			} catch (error) { events.push("unknown"); throw error; }
		},
	};
	const newTx = async <T>(consume: (tx: Tx) => Promise<T>) => {
		expect(held).toBe(true);
		transaction = true;
		events.push("begin");
		try { const result = await consume({} as Tx); events.push("commit"); controls.afterCommit(); return result; }
		catch (error) { events.push("rollback"); throw error; }
		finally { transaction = false; }
	};
	return { request, runtime, newTx, events, producer, controller, controls,
		isHeld: () => held, assertHeld: () => { expect(held).toBe(true); expect(transaction).toBe(true); } };
}

test("acquires outside the transaction and holds through the aggregate seal", async () => {
	const f = fixture();
	const result = await withCaptureTransaction(f, f.request, async () => {
		for (const action of ["revalidate", "workspace", "conversation", "snapshot", "seal"]) {
			f.assertHeld(); f.events.push(action); await Promise.resolve();
		}
		return "sealed";
	});
	expect(result.value).toBe("sealed");
	expect(result.finalization.receipt.outcome).toBe("committed");
	expect(f.events).toEqual(["acquire", "begin", "revalidate", "workspace", "conversation", "snapshot", "seal", "commit", "finalized"]);
});

test("preserves an export failure and leaves finalization unknown", async () => {
	const f = fixture();
	const failure = new Error("seal_failed");
	await expect(withCaptureTransaction(f, f.request, async () => { f.assertHeld(); throw failure; })).rejects.toBe(failure);
	expect(f.events).toEqual(["acquire", "begin", "rollback", "unknown"]);
	expect(f.isHeld()).toBe(true);
});

test("loss after the last root seal prevents the aggregate callback and commit", async () => {
	const f = fixture();
	const failure = new Error("capture_channel_lost");
	const snapshot = await snapshotFixture();
	try {
		await expect(withCaptureTransaction(f, f.request, async (_tx, producer) => {
			f.events.push("last-root-seal");
			f.controller.abort(failure);
			return sealSnapshot({ directory: snapshot.snapshot, metadata: snapshot.metadata, signal: producer.signal });
		})).rejects.toBe(failure);
		expect(await Bun.file(join(snapshot.snapshot, manifestName)).exists()).toBe(false);
		expect(f.events).toEqual(["acquire", "begin", "last-root-seal", "rollback", "unknown"]);
		expect(f.isHeld()).toBe(true);
	} finally {
		await rm(snapshot.root, { recursive: true });
	}
});

test("loss at callback completion refuses transaction commit", async () => {
	const f = fixture();
	const failure = new Error("capture_channel_lost");
	await expect(withCaptureTransaction(f, f.request, async () => {
		f.controller.abort(failure);
		return "unconfirmed-seal";
	})).rejects.toBe(failure);
	expect(f.events).toEqual(["acquire", "begin", "rollback", "unknown"]);
});

test("loss during commit reports uncertainty after the commit settles", async () => {
	const f = fixture();
	const failure = new Error("capture_channel_lost");
	f.controls.afterCommit = () => f.controller.abort(failure);
	await expect(withCaptureTransaction(f, f.request, async () => "sealed")).rejects.toBe(failure);
	expect(f.events).toEqual(["acquire", "begin", "commit", "unknown"]);
	expect(f.isHeld()).toBe(true);
});

test("a missing finalization receipt cannot report a committed result as success", async () => {
	const f = fixture();
	const failure = new Error("capture_finalization_unknown");
	f.controls.finalizationError = failure;
	await expect(withCaptureTransaction(f, f.request, async () => "sealed")).rejects.toBe(failure);
	expect(f.events).toEqual(["acquire", "begin", "commit", "unknown"]);
	expect(f.isHeld()).toBe(true);
});

for (const kind of ["no-attempts", "all-unavailable"] as const) {
	test(`an empty runtime batch preserves ${kind} in the aggregate seal`, async () => {
		const f = fixture();
		const snapshot = await snapshotFixture();
		try {
			const records: CaptureRecords = { runs: [], native: [] };
			if (kind === "all-unavailable") records.runs.push({
				agentRunId: "old-run", attemptId: "old-attempt", workspaceId: "/fixture/old-workspace",
				providerSessionId: "old-session", sessionLost: false, sessionDirectory: null,
			});
			const retained = await readCaptureIdentities(snapshot.root, records);
			expect(retained.identities).toEqual([]);
			expect(retained.workspaces).toEqual([]);
			expect(retained.unavailable).toHaveLength(kind === "all-unavailable" ? 2 : 0);
			const manifest = await withCaptureTransaction(f, { ...f.request, identities: retained.identities }, async (_tx, capture) => {
				f.assertHeld();
				const unavailable = await exportCapturedHistory(capture, { directory: snapshot.snapshot, signal: capture.signal });
				return sealSnapshot({
					directory: snapshot.snapshot, signal: capture.signal,
					metadata: { ...snapshot.metadata, unavailable: [...retained.unavailable, ...unavailable] },
				});
			});
			expect(manifest.value.unavailable).toEqual(retained.unavailable);
			expect(f.events).toEqual(["acquire", "begin", "commit", "finalized"]);
		} finally {
			await rm(snapshot.root, { recursive: true });
		}
	});
}

test("does not open a transaction when the runtime refuses capture", async () => {
	const f = fixture();
	f.runtime.withCaptureSnapshot = async () => { throw new Error("CAPTURE_UNAVAILABLE"); };
	await expect(withCaptureTransaction(f, f.request, async () => "unexpected")).rejects.toThrow("CAPTURE_UNAVAILABLE");
	expect(f.events).toEqual([]);
});
