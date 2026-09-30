import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { nativeClient } from "../../../agents/native/connection";
import { LangflowHostControl } from "../../../langflowHost";
import type { IoCtx } from "../../support";
import { assertCaptureGate } from "../assertCaptureGate";
import { captureTrellisSnapshot } from "../captureTrellisSnapshot";
import { exportCapturedHistory } from "../exportCapturedHistory";
import type { TrellisCaptureResult, TrellisSealInput } from "../pairedContracts";
import { PairedJournal } from "../pairedJournal";
import { readCaptureIdentities } from "../readCaptureIdentities";
import { readCaptureRecords } from "../readCaptureRecords";
import { validateCaptureBinding } from "../validateCaptureBinding";
import { validateRuntimeFinalization } from "../validateRuntimeFinalization";
import { withCaptureTransaction } from "../withCaptureTransaction";

export async function captureTrellisSnapshotHeld<T>(
	ctx: IoCtx,
	input: TrellisSealInput,
	consume: (trellis: TrellisCaptureResult, signal: AbortSignal) => Promise<T>,
) {
	const records = await ctx.newTx(readCaptureRecords);
	const retained = await readCaptureIdentities(ctx.home, records);
	const request = {
		captureId: randomUUID(), snapshotId: input.metadata.snapshotId,
		hostId: input.metadata.sourceHostId, dataHomeId: input.block.dataHomeId,
		generation: input.block.generation, blockId: input.block.id, identities: retained.identities,
	};
	assertCaptureGate(ctx.home, input);
	const journal = await PairedJournal.open(LangflowHostControl.openCapture({ home: ctx.home }), input.metadata.snapshotId);
	await journal.write("runtime-request", request);
	const captured = await withCaptureTransaction({ newTx: ctx.newTx, runtime: nativeClient(ctx.home) }, request, async (tx, capture) => {
		capture.signal.throwIfAborted();
		validateCaptureBinding(capture.binding, request, retained.workspaces);
		assertCaptureGate(ctx.home, input);
		const current = await readCaptureRecords(tx);
		capture.signal.throwIfAborted();
		if (!isDeepStrictEqual(current, records)) throw new Error("paired_retained_records_changed");
		const currentIdentities = await readCaptureIdentities(ctx.home, current);
		capture.signal.throwIfAborted();
		if (!isDeepStrictEqual(currentIdentities, retained)) throw new Error("paired_launch_identity_changed");
		const missing = await exportCapturedHistory(capture, {
			directory: input.directory, signal: capture.signal,
		});
		const trellis = await captureTrellisSnapshot(ctx, tx, input, {
			records, unavailable: [...retained.unavailable, ...missing], signal: capture.signal,
		});
		assertCaptureGate(ctx.home, input);
		capture.signal.throwIfAborted();
		const sealed = await consume(trellis, capture.signal);
		capture.signal.throwIfAborted();
		assertCaptureGate(ctx.home, input);
		return sealed;
	});
	validateRuntimeFinalization(request, captured.finalization);
	await journal.write("runtime-finalized", captured.finalization);
	return captured.value;
}
