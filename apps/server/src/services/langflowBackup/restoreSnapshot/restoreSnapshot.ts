import { mkdir, open, realpath, rename } from "node:fs/promises";
import { basename, dirname, join, sep } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { manifestName, recoveryName, type SnapshotCompatibility, type SnapshotManifest } from "../manifest";
import { readSnapshot } from "../readSnapshot";
import { syncDirectory } from "../syncDirectory";
import { copySnapshot } from "./components/copySnapshot";

export type RestoreContext = {
	blockDispatch(input: { directory: string; manifest: SnapshotManifest }): Promise<void>;
};

export async function restoreSnapshot(
	ctx: RestoreContext,
	input: {
		snapshot: string;
		destination: string;
		compatibility: SnapshotCompatibility;
	},
) {
	const snapshot = await realpath(input.snapshot);
	const parent = await realpath(dirname(input.destination));
	const destination = join(parent, basename(input.destination));
	if (destination === snapshot || destination.startsWith(`${snapshot}${sep}`))
		throw new Error("restore_destination_inside_snapshot");
	const manifest = await readSnapshot(snapshot);
	if (!isDeepStrictEqual(manifest.compatibility, input.compatibility)) throw new Error("restore_version_mismatch");
	await mkdir(destination, { mode: 0o700 });
	const block = await open(join(destination, recoveryName), "wx", 0o600);
	try {
		await block.writeFile(
			JSON.stringify({
				version: 1,
				snapshotId: manifest.snapshotId,
				state: "requires-reconciliation",
				sourceDataHomeId: manifest.sourceDataHomeId,
				sourceHostId: manifest.sourceHostId,
			}),
		);
		await block.sync();
	} finally {
		await block.close();
	}
	await syncDirectory(destination);
	await syncDirectory(parent);
	await ctx.blockDispatch({ directory: destination, manifest });
	const payload = join(destination, "payload.partial");
	await mkdir(payload, { mode: 0o700 });
	await copySnapshot(snapshot, payload, manifest);
	const file = await open(join(payload, manifestName), "wx", 0o600);
	try {
		await file.writeFile(JSON.stringify(manifest));
		await file.sync();
	} finally {
		await file.close();
	}
	await readSnapshot(payload);
	await syncDirectory(payload);
	await rename(payload, join(destination, "payload"));
	await syncDirectory(destination);
	return {
		directory: destination,
		payload: join(destination, "payload"),
		manifest,
		state: "requires-reconciliation" as const,
	};
}
