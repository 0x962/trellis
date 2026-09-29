import { mkdir, readFile, realpath } from "node:fs/promises";
import { basename, dirname, join, sep } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { protocolDigest } from "../../../langflowContracts";
import { type DispatchBlock, type HostControlIdentity, LangflowHostControl } from "../../../langflowHost";
import { manifestName, type SnapshotCompatibility } from "../manifest";
import { PairedJournal } from "../pairedJournal";
import { readSnapshot } from "../readSnapshot";
import { restoreSnapshot } from "../restoreSnapshot";
import { syncDirectory } from "../syncDirectory";

export async function restorePairedSnapshot(
	ctx: { liveHome: string },
	input: { snapshot: string; destination: string; targetHome: string; requestId: string; compatibility: SnapshotCompatibility; signal: AbortSignal },
) {
	const liveHome = await realpath(ctx.liveHome);
	const snapshot = await realpath(input.snapshot);
	const targetHome = join(await realpath(dirname(input.targetHome)), basename(input.targetHome));
	const destination = join(await realpath(dirname(input.destination)), basename(input.destination));
	const contains = (parent: string, child: string) => parent === child || child.startsWith(`${parent}${sep}`);
	const liveControl = LangflowHostControl.directory(liveHome);
	if ([liveHome, liveControl, snapshot, destination].some((path) => contains(path, targetHome) || contains(targetHome, path)) ||
		[liveHome, liveControl].some((path) => contains(path, destination) || contains(destination, path)))
		throw new Error("paired_restore_destination_conflict");
	const manifest = await readSnapshot(snapshot);
	if (!isDeepStrictEqual(manifest.compatibility, input.compatibility)) throw new Error("restore_version_mismatch");
	const manifestDigest = protocolDigest(JSON.stringify(manifest));
	await mkdir(targetHome, { mode: 0o700 });
	await syncDirectory(dirname(targetHome));
	const initialized: { identity: HostControlIdentity; block: DispatchBlock; journal: PairedJournal }[] = [];
	const restored = await restoreSnapshot({
		blockDispatch: async ({ directory, manifest: current }) => {
			if (!isDeepStrictEqual(current, manifest)) throw new Error("paired_restore_manifest_changed");
			input.signal.throwIfAborted();
			const control = LangflowHostControl.initialize({
				home: targetHome,
				initialBlock: {
					requestId: input.requestId,
					reason: { kind: "restore", directory, snapshotId: manifest.snapshotId, sourceDataHomeId: manifest.sourceDataHomeId, manifestDigest },
				},
			});
			const block = control.block;
			if (!block || block.reason.kind !== "restore") throw new Error("paired_restore_block_missing");
			const journal = await PairedJournal.create(control, {
				version: 1, kind: "restore", snapshotId: manifest.snapshotId, requestId: input.requestId,
				directory, dataHomeId: control.identity.dataHomeId, hostId: control.identity.hostId,
				compatibility: manifest.compatibility, createdAt: new Date().toISOString(),
			});
			await journal.write("block", block);
			initialized.push({ identity: control.identity, block, journal });
		},
	}, { snapshot, destination, compatibility: input.compatibility });
	const retained = initialized[0];
	if (!retained) throw new Error("paired_restore_not_initialized");
	if (protocolDigest(await readFile(join(restored.payload, manifestName), "utf8")) !== manifestDigest)
		throw new Error("paired_restore_manifest_changed");
	await retained.journal.write("restored", { payload: restored.payload, manifestDigest, targetHome });
	return { ...restored, targetHome, identity: retained.identity, block: retained.block, manifestDigest };
}
