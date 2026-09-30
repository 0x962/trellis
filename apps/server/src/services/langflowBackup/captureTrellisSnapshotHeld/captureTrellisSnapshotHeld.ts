import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { nativeClient } from "../../../agents/native/connection";
import type { IoCtx } from "../../support";
import { assertCaptureGate } from "../assertCaptureGate";
import { captureTrellisSnapshot } from "../captureTrellisSnapshot";
import { exportCapturedHistory } from "../exportCapturedHistory";
import type { TrellisCaptureResult, TrellisSealInput } from "../pairedContracts";
import { readCaptureIdentities } from "../readCaptureIdentities";
import { readCaptureRecords } from "../readCaptureRecords";
import { validateCaptureBinding } from "../validateCaptureBinding";
import { withCaptureTransaction } from "../withCaptureTransaction";

export async function captureTrellisSnapshotHeld<T>(
	ctx: IoCtx,
	input: TrellisSealInput,
	consume: (trellis: TrellisCaptureResult) => Promise<T>,
) {
	const records = await ctx.newTx(readCaptureRecords);
	const retained = await readCaptureIdentities(ctx.home, records);
	const request = {
		captureId: randomUUID(), snapshotId: input.metadata.snapshotId,
		hostId: input.metadata.sourceHostId, dataHomeId: input.block.dataHomeId,
		generation: input.block.generation, blockId: input.block.id, identities: retained.identities,
	};
	return withCaptureTransaction({ newTx: ctx.newTx, runtime: nativeClient(ctx.home) }, request, async (tx, capture) => {
		validateCaptureBinding(capture.binding, request, retained.workspaces);
		assertCaptureGate(ctx.home, input);
		const current = await readCaptureRecords(tx);
		if (!isDeepStrictEqual(current, records)) throw new Error("paired_retained_records_changed");
		const currentIdentities = await readCaptureIdentities(ctx.home, current);
		if (!isDeepStrictEqual(currentIdentities, retained)) throw new Error("paired_launch_identity_changed");
		const missing = await exportCapturedHistory(capture, {
			directory: input.directory, signal: new AbortController().signal,
		});
		const trellis = await captureTrellisSnapshot(ctx, tx, input, {
			records, unavailable: [...retained.unavailable, ...missing],
		});
		assertCaptureGate(ctx.home, input);
		const sealed = await consume(trellis);
		assertCaptureGate(ctx.home, input);
		return sealed;
	});
}
