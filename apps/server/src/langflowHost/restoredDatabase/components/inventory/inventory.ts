import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readdir } from "node:fs/promises";
import { join } from "node:path";

export async function databaseInventory(directory: string) {
	const directories: string[] = [];
	const files: { path: string; sha256: string; size: number; executable: boolean }[] = [];
	async function visit(relative: string): Promise<void> {
		const path = relative ? join(directory, relative) : directory;
		const stat = await lstat(path);
		if (stat.isDirectory()) {
			if (relative) directories.push(relative);
			for (const name of (await readdir(path)).sort()) await visit(relative ? `${relative}/${name}` : name);
			return;
		}
		if (!stat.isFile() || stat.nlink !== 1) throw new Error("restored_database_file_unsafe");
		const fd = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
		try {
			const current = await fd.stat();
			if (!current.isFile() || current.nlink !== 1) throw new Error("restored_database_file_unsafe");
			const digest = createHash("sha256");
			let size = 0;
			for await (const bytes of fd.createReadStream({ autoClose: false })) {
				digest.update(bytes);
				size += bytes.length;
			}
			files.push({ path: relative, sha256: digest.digest("hex"), size, executable: (current.mode & 0o111) !== 0 });
		} finally {
			await fd.close();
		}
	}
	await visit("");
	return { directories, files };
}
