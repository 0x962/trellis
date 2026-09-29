import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readdir } from "node:fs/promises";
import { join } from "node:path";
import { type SnapshotManifest, snapshotRoots } from "../manifest";

export async function inventory(root: string) {
	const directories: string[] = [];
	const files: SnapshotManifest["files"] = [];
	const visit = async (relative: string): Promise<void> => {
		const path = join(root, relative);
		const stat = await lstat(path);
		if (stat.isDirectory()) {
			directories.push(relative);
			for (const name of (await readdir(path)).sort()) await visit(`${relative}/${name}`);
			return;
		}
		if (!stat.isFile() || stat.nlink !== 1) throw new Error("snapshot_link_or_special_file");
		const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
		try {
			const metadata = await file.stat();
			if (!metadata.isFile() || metadata.nlink !== 1) throw new Error("snapshot_link_or_special_file");
			const hash = createHash("sha256");
			let size = 0;
			for await (const chunk of file.createReadStream({ autoClose: false })) {
				hash.update(chunk);
				size += chunk.length;
			}
			files.push({ path: relative, sha256: hash.digest("hex"), size, executable: (metadata.mode & 0o111) !== 0 });
		} finally {
			await file.close();
		}
	};
	for (const name of snapshotRoots) {
		if (!(await lstat(join(root, name))).isDirectory()) throw new Error("snapshot_root_not_directory");
		await visit(name);
	}
	return { directories, files };
}
