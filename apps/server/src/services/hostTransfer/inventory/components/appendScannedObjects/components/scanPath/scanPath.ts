import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readdir, readlink } from "node:fs/promises";
import { join } from "node:path";

export type ScannedSymlink = {
	relativePath: string;
	target: string;
	bytes: number;
	sha256: string;
};

export type ScannedPath = {
	bytes: number;
	sha256: string;
	symlinks: ScannedSymlink[];
};

const digest = (parts: string[]) => createHash("sha256").update(parts.join("\0")).digest("hex");

const hashFile = async (path: string) => {
	const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
	try {
		const hash = createHash("sha256");
		const buffer = Buffer.alloc(65536);
		for (
			let result = await file.read(buffer, 0, buffer.length, null);
			result.bytesRead > 0;
			result = await file.read(buffer, 0, buffer.length, null)
		)
			hash.update(buffer.subarray(0, result.bytesRead));
		return hash.digest("hex");
	} finally {
		await file.close();
	}
};

export const scanPath = async (root: string, excludedPaths: ReadonlySet<string> = new Set()): Promise<ScannedPath> => {
	const symlinks: ScannedSymlink[] = [];
	const visit = async (path: string, relativePath: string): Promise<{ bytes: number; sha256: string }> => {
		const info = await lstat(path);
		const mode = String(info.mode & 0o777);
		if (info.isSymbolicLink()) {
			const target = await readlink(path);
			const bytes = Buffer.byteLength(target);
			const sha256 = digest(["symlink", relativePath, mode, target]);
			symlinks.push({ relativePath, target, bytes, sha256 });
			// scanPath lists each symbolic link in `symlinks`.
			// Exclude its bytes from the directory total to prevent a duplicate count.
			return { bytes: 0, sha256 };
		}
		if (info.isFile()) {
			const contentSha256 = await hashFile(path);
			return {
				bytes: info.size,
				sha256: digest(["file", relativePath, mode, String(info.size), contentSha256]),
			};
		}
		if (!info.isDirectory()) throw new Error(`Unsupported transfer entry: ${path}`);
		const children: Array<{ name: string; bytes: number; sha256: string }> = [];
		for (const name of (await readdir(path)).sort()) {
			const childPath = relativePath === "" ? name : join(relativePath, name);
			if (excludedPaths.has(childPath)) continue;
			children.push({ name, ...(await visit(join(path, name), childPath)) });
		}
		return {
			bytes: children.reduce((total, child) => total + child.bytes, 0),
			sha256: digest([
				"directory",
				relativePath,
				mode,
				...children.flatMap((child) => [child.name, String(child.bytes), child.sha256]),
			]),
		};
	};
	return { ...(await visit(root, "")), symlinks };
};
