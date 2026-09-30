import { chmod, readFile, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { protocolDigest } from "../../../langflowContracts";
import type { IoCtx } from "../../support";
import { assertCaptureGate } from "../assertCaptureGate";
import { captureTrellisSnapshotHeld } from "../captureTrellisSnapshotHeld";
import { manifestName } from "../manifest/manifest";
import type { TrellisSealInput, TrellisSealResult } from "../pairedContracts";
import { sealSnapshot } from "../sealSnapshot";
import { syncDirectory } from "../syncDirectory";
import { syncSnapshotTree } from "../syncSnapshotTree";

export async function captureTrellisAndSeal(ctx: IoCtx, input: TrellisSealInput): Promise<TrellisSealResult> {
	if (ctx.actor.kind !== "system") throw new Error("paired_capture_requires_system_actor");
	const { metadata, block, expectedVersion } = input;
	if (block.reason.kind !== "capture" || block.reason.snapshotId !== metadata.snapshotId ||
		block.dataHomeId !== metadata.sourceDataHomeId ||
		metadata.compatibility.trellisRelease !== expectedVersion.trellisRelease ||
		metadata.compatibility.trellisDatabaseVersion !== expectedVersion.trellisDatabaseVersion)
		throw new Error("paired_trellis_capture_binding_mismatch");
	assertCaptureGate(ctx.home, input);
	return captureTrellisSnapshotHeld(ctx, input, async (trellis) => {
		await chmod(trellis.staging, 0o700);
		await syncSnapshotTree(trellis.staging);
		await rename(trellis.staging, join(input.directory, "trellis"));
		await syncDirectory(dirname(trellis.staging));
		await syncDirectory(input.directory);
		const manifest = await sealSnapshot({
			directory: input.directory,
			metadata: { ...metadata, unavailable: [...metadata.unavailable, ...trellis.unavailable] },
		});
		const manifestBytes = await readFile(join(input.directory, manifestName), "utf8");
		if (!isDeepStrictEqual(JSON.parse(manifestBytes), manifest)) throw new Error("paired_seal_changed");
		return { directory: input.directory, manifest, manifestBytes, manifestDigest: protocolDigest(manifestBytes), trellis };
	});
}
