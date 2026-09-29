import { lstat, open, readdir } from "node:fs/promises";
import { join } from "node:path";
import { inventory } from "../inventory";
import { manifestName, SnapshotManifestSchema, type SnapshotMetadata, snapshotRoots } from "../manifest";
import { syncDirectory } from "../syncDirectory";

export async function sealSnapshot(input: { directory: string; metadata: SnapshotMetadata }) {
	const root = await lstat(input.directory);
	if (!root.isDirectory() || (root.mode & 0o077) !== 0) throw new Error("snapshot_directory_not_private");
	const names = await readdir(input.directory);
	if (names.some((name) => !snapshotRoots.includes(name as (typeof snapshotRoots)[number])))
		throw new Error("snapshot_unexpected_root");
	const manifest = SnapshotManifestSchema.parse({
		...input.metadata,
		version: 1,
		capability: "langflow-paired-v1",
		...(await inventory(input.directory)),
	});
	const file = await open(join(input.directory, manifestName), "wx", 0o600);
	try {
		await file.writeFile(JSON.stringify(manifest));
		await file.sync();
	} finally {
		await file.close();
	}
	await syncDirectory(input.directory);
	return manifest;
}
