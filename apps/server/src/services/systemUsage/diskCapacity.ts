import { realpath, stat, statfs } from "node:fs/promises";
import type { DiskCapacity } from "@trellis/api";

export const readDiskCapacity = async (workspaceRoot: string): Promise<DiskCapacity> => {
	try {
		const path = await realpath(workspaceRoot);
		const [volume, capacity] = await Promise.all([stat(path), statfs(path)]);
		const totalBytes = capacity.blocks * capacity.bsize;
		if (totalBytes === 0) return { state: "failed", path };
		return {
			state: "available",
			path,
			volumeId: String(volume.dev),
			sampledAt: new Date().toISOString(),
			availableBytes: capacity.bavail * capacity.bsize,
			totalBytes,
			usedPercent: ((capacity.blocks - capacity.bfree) / capacity.blocks) * 100,
		};
	} catch {
		return { state: "failed", path: workspaceRoot };
	}
};
