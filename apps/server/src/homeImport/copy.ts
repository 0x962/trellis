import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, open, symlink } from "node:fs/promises";
import { join } from "node:path";
import type { CopyEntry } from "./types.ts";
export const copyEntries = async (source: string, target: string, entries: CopyEntry[]) => {
	for (const entry of entries) {
		const destination = join(target, entry.path);
		if (entry.kind === "directory") {
			await mkdir(destination, { mode: entry.mode });
			continue;
		}
		if (entry.kind === "symlink") {
			await symlink(entry.copyLink!, destination);
			continue;
		}
		const input = await open(join(source, entry.path), constants.O_RDONLY | constants.O_NOFOLLOW);
		try {
			const output = await open(destination, "wx", entry.mode);
			try {
				const hash = createHash("sha256");
				const buffer = Buffer.alloc(65536);
				for (
					let result = await input.read(buffer, 0, buffer.length, null);
					result.bytesRead > 0;
					result = await input.read(buffer, 0, buffer.length, null)
				) {
					const bytes = buffer.subarray(0, result.bytesRead);
					hash.update(bytes);
					await output.writeFile(bytes);
				}
				await output.sync();
				if (hash.digest("hex") !== entry.sha256)
					throw new Error(`Source file changed during import: ${entry.path}. Preview the source again.`);
			} finally {
				await output.close();
			}
		} finally {
			await input.close();
		}
	}
};
