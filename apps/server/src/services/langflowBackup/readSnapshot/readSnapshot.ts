import { lstat, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { inventory } from "../inventory";
import { manifestName, SnapshotManifestSchema, snapshotRoots } from "../manifest";

export async function readSnapshot(directory: string) {
	const root = await lstat(directory);
	if (!root.isDirectory() || (root.mode & 0o077) !== 0) throw new Error("snapshot_directory_not_private");
	const names = await readdir(directory);
	const allowed = new Set<string>([...snapshotRoots, manifestName]);
	if (names.some((name) => !allowed.has(name))) throw new Error("snapshot_unexpected_root");
	const manifestPath = join(directory, manifestName);
	const stat = await lstat(manifestPath);
	if (!stat.isFile() || stat.nlink !== 1) throw new Error("snapshot_invalid_manifest_file");
	const manifest = SnapshotManifestSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")));
	const actual = await inventory(directory);
	if (!isDeepStrictEqual(actual, { directories: manifest.directories, files: manifest.files }))
		throw new Error("snapshot_inventory_mismatch");
	return manifest;
}
