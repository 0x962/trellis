import { isDeepStrictEqual } from "node:util";
import type { CaptureAuthority, HostCaptureControl } from "../../../langflowHost";
import { CaptureRecordSchema } from "../../../langflowHost/captureAuthority/schema/schema";
import { PairedJournal } from "../pairedJournal";
import { readPairedSeal } from "../readPairedSeal";
import { validateRuntimeFinalization } from "../validateRuntimeFinalization";

export async function finishPairedCapture(
	ctx: { control: Pick<HostCaptureControl, "identity"> & { gate: Pick<HostCaptureControl["gate"], "read"> }; authority: CaptureAuthority },
	input: { snapshotId: string; signal: AbortSignal },
) {
	const sealed = await readPairedSeal(ctx, input);
	if (sealed.request.kind !== "capture" || !isDeepStrictEqual(ctx.control.gate.read().block, sealed.block))
		throw new Error("paired_capture_block_changed");
	const journal = await PairedJournal.open(ctx.control, input.snapshotId);
	const runtimeRequest = await journal.read("runtime-request");
	if (runtimeRequest !== null) {
		const { receipt } = validateRuntimeFinalization(runtimeRequest, await journal.read("runtime-finalized"));
		if (
			receipt.request.snapshotId !== input.snapshotId ||
			receipt.request.blockId !== sealed.block.id ||
			receipt.request.generation !== sealed.block.generation ||
			receipt.request.dataHomeId !== ctx.control.identity.dataHomeId ||
			receipt.request.hostId !== ctx.control.identity.hostId
		)
			throw new Error("paired_runtime_finalization_binding_mismatch");
	}
	const grant = CaptureRecordSchema.parse(await journal.read("grant"));
	await journal.write("sealed", { manifest: sealed.manifest, manifestDigest: sealed.manifestDigest });
	await journal.write("revoking", { grantBytes: grant.grantBytes });
	const revoked = await ctx.authority.revoke(grant.grantBytes, input.signal);
	if (revoked.state !== "revoked") throw new Error("paired_capture_revocation_unknown");
	await journal.write("revoked", revoked);
	return { block: sealed.block, manifestDigest: sealed.manifestDigest, state: "requires-reconciliation" as const };
}
