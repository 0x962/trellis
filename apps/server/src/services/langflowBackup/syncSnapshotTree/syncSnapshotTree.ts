import { constants } from "node:fs";
import { open, readdir } from "node:fs/promises";
import { join } from "node:path";
import { syncDirectory } from "../syncDirectory";

export async function syncSnapshotTree(directory: string, signal?: AbortSignal): Promise<void> {
	signal?.throwIfAborted();
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		signal?.throwIfAborted();
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			await syncSnapshotTree(path, signal);
		} else if (entry.isFile()) {
			const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
			try {
				await file.sync();
			} finally {
				await file.close();
			}
		} else {
			throw new Error("paired_snapshot_special_file");
		}
	}
	await syncDirectory(directory);
	signal?.throwIfAborted();
}
