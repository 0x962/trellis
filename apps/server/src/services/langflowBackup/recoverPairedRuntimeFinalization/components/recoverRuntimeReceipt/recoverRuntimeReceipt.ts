import { isDeepStrictEqual } from "node:util";
import type { RuntimeCaptureRequest } from "@trellis/runtime-protocol";
import type { RuntimeClient } from "@trellis/runtime-protocol/client";
import type { HostCaptureControl } from "../../../../../langflowHost";
import { ReconciliationReceiptSchema } from "../../../../../langflowHost/dispatchGate/store/schema";
import { PairedJournal, PairedRequestSchema } from "../../../pairedJournal";
import { parseRuntimeFinalization } from "../../../parseRuntimeFinalization";
import { RuntimeCaptureRequestSchema } from "../../../runtimeFinalizationSchema";

export async function recoverRuntimeReceipt(
	ctx: {
		control: Pick<HostCaptureControl, "identity"> & { gate: Pick<HostCaptureControl["gate"], "read"> };
		runtime: Pick<RuntimeClient, "readCaptureFinalization" | "finalizeCapture">;
	},
	input: { snapshotId: string },
) {
	const journal = await PairedJournal.open(ctx.control, input.snapshotId);
	const paired = PairedRequestSchema.parse(await journal.read("request"));
	const block = ReconciliationReceiptSchema.shape.block.parse(await journal.read("block"));
	const original = await journal.read("runtime-request");
	if (original === null) throw new Error("paired_runtime_request_unavailable");
	const checked = RuntimeCaptureRequestSchema.parse(original);
	if (
		paired.kind !== "capture" || paired.snapshotId !== input.snapshotId ||
		checked.snapshotId !== paired.snapshotId ||
		checked.hostId !== ctx.control.identity.hostId || checked.dataHomeId !== ctx.control.identity.dataHomeId ||
		checked.blockId !== block.id || checked.generation !== block.generation ||
		block.dataHomeId !== checked.dataHomeId || block.reason.kind !== "capture" || block.reason.snapshotId !== checked.snapshotId
	)
		throw new Error("paired_runtime_request_binding_mismatch");
	const assertBlock = () => {
		if (!isDeepStrictEqual(ctx.control.gate.read().block, block)) throw new Error("paired_capture_block_changed");
	};
	assertBlock();
	const request = original as RuntimeCaptureRequest;
	const saved = await ctx.runtime.readCaptureFinalization(request);
	assertBlock();
	const identity = { snapshotId: input.snapshotId, captureId: request.captureId };
	if (saved === null) return { ...identity, state: "unknown" as const, finalization: null };
	const finalization = parseRuntimeFinalization(request, saved);
	const previous = await journal.read("runtime-finalized");
	if (previous !== null && !isDeepStrictEqual(parseRuntimeFinalization(request, previous), finalization))
		throw new Error("paired_runtime_finalization_conflict");
	assertBlock();
	const settled = await ctx.runtime.finalizeCapture({ request, outcome: finalization.receipt.outcome });
	assertBlock();
	if (!isDeepStrictEqual(parseRuntimeFinalization(request, settled), finalization))
		throw new Error("paired_runtime_finalization_conflict");
	await journal.write("runtime-finalized", saved);
	assertBlock();
	return { ...identity, state: finalization.receipt.outcome, finalization: saved };
}
