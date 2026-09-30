import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RuntimeCaptureFinalization, RuntimeCaptureFinalizeInput, RuntimeCaptureRequest } from "@trellis/runtime-protocol";
import type { DispatchBlock, HostControlIdentity } from "../../../../../apps/server/src/langflowHost";
import { PairedJournal } from "../../../../../apps/server/src/services/langflowBackup/pairedJournal";
import { metadata } from "../fixture";

export async function runtimeRecoveryFixture(outcome: "committed" | "abandoned" = "committed") {
	const root = await realpath(await mkdtemp(join(tmpdir(), "trellis-runtime-recovery-")));
	const home = join(root, "home");
	await mkdir(home, { mode: 0o700 });
	const identity: HostControlIdentity = { version: 1, home, hostId: randomUUID(), dataHomeId: randomUUID() };
	const snapshotId = randomUUID();
	const block: DispatchBlock = {
		id: randomUUID(), dataHomeId: identity.dataHomeId, generation: 1,
		requestId: "capture-request", reason: { kind: "capture", snapshotId },
	};
	const state = {
		version: 1 as const, dataHomeId: identity.dataHomeId, generation: 1, block,
		permits: [], reconciliations: [], captureGrants: [],
	};
	const control = { identity, gate: { read: () => state } };
	const journal = await PairedJournal.create(control, {
		version: 1, kind: "capture", snapshotId, requestId: block.requestId,
		directory: join(root, "snapshot"), dataHomeId: identity.dataHomeId, hostId: identity.hostId,
		compatibility: metadata.compatibility, createdAt: metadata.createdAt,
	});
	const request: RuntimeCaptureRequest = {
		captureId: randomUUID(), snapshotId, hostId: identity.hostId, dataHomeId: identity.dataHomeId,
		generation: 1, blockId: block.id, identities: [],
	};
	await journal.write("block", block);
	await journal.write("runtime-request", request);
	const receipt: RuntimeCaptureFinalization["receipt"] = {
		schemaVersion: 1, kind: "trellis-runtime-capture-finalization", request,
		requestSha256: createHash("sha256").update(JSON.stringify(request)).digest("hex"),
		outcome, finalizedAt: "2026-09-30T00:00:00.000Z",
	};
	const finalization: RuntimeCaptureFinalization = { receipt, receiptBytes: `${JSON.stringify(receipt, null, 2)}\n` };
	const runtimeState = { finalization: finalization as RuntimeCaptureFinalization | null, hold: true };
	const reads: RuntimeCaptureRequest[] = [];
	const finalizes: RuntimeCaptureFinalizeInput[] = [];
	const runtime = {
		async readCaptureFinalization(input: RuntimeCaptureRequest) {
			reads.push(input);
			return runtimeState.finalization;
		},
		async finalizeCapture(input: RuntimeCaptureFinalizeInput) {
			finalizes.push(input);
			runtimeState.hold = false;
			return finalization;
		},
	};
	return {
		root, control, journal, request, finalization, runtimeState, reads, finalizes, runtime,
		input: { snapshotId },
		cleanup: () => rm(root, { recursive: true, force: true }),
	};
}
