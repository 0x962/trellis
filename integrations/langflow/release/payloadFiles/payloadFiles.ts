import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";

export type PayloadFile = { path: string; sha256: string; sizeBytes: number };

export async function payloadFiles(root: string): Promise<PayloadFile[]> {
	const files: PayloadFile[] = [];
	async function visit(relative: string) {
		const absolute = join(root, relative);
		const stat = await lstat(absolute);
		if (stat.isSymbolicLink()) throw new Error(`package_symlink: ${relative}`);
		if (stat.isDirectory()) {
			for (const name of (await readdir(absolute)).sort()) {
				if (name.includes("\\")) throw new Error("package_unsafe_path");
				await visit(relative ? `${relative}/${name}` : name);
			}
			return;
		}
		if (!stat.isFile()) throw new Error(`package_not_regular: ${relative}`);
		const hash = createHash("sha256");
		let sizeBytes = 0;
		for await (const chunk of createReadStream(absolute)) {
			hash.update(chunk);
			sizeBytes += chunk.length;
		}
		files.push({ path: relative, sha256: hash.digest("hex"), sizeBytes });
	}
	await visit("");
	return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
