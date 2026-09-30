import { constants } from "node:fs";
import { mkdir, open } from "node:fs/promises";
import { join } from "node:path";
import type { SnapshotManifest } from "../manifest";
import { syncDirectory } from "../syncDirectory";

export async function copySnapshot(source: string, target: string, manifest: SnapshotManifest) {
	for (const path of manifest.directories) await mkdir(join(target, path), { mode: 0o700 });
	for (const entry of manifest.files) {
		const input = await open(join(source, entry.path), constants.O_RDONLY | constants.O_NOFOLLOW);
		try {
			const stat = await input.stat();
			if (!stat.isFile() || stat.nlink !== 1) throw new Error("snapshot_link_or_special_file");
			const output = await open(join(target, entry.path), "wx", entry.executable ? 0o700 : 0o600);
			try {
				for await (const chunk of input.createReadStream({ autoClose: false })) await output.writeFile(chunk);
				await output.sync();
			} finally {
				await output.close();
			}
		} finally {
			await input.close();
		}
	}
	for (const path of [...manifest.directories].reverse()) await syncDirectory(join(target, path));
}
