import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readdir, readlink } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { version } from "../services/nativeMigration/version.ts";
import { canonicalTarget, inside } from "./paths.ts";
import type { CopyEntry, CopyPlan } from "./types.ts";

const excludedNames = new Set([
	"trellis.lock",
	"desktop-token",
	"desktop-active-release.json",
	"desktop-service.pid",
	"desktop-port",
	"runtime/runtime.lock",
	"runtime/runtime.sock",
	"runtime/manifest.json",
	"releases",
	"import-in-progress.json",
	".home-import-stage",
]);
export const hashPath = async (path: string) => {
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
export const scan = async (source: string, target: string): Promise<CopyPlan> => {
	const entries: CopyEntry[] = [];
	const excluded: string[] = [];
	const visit = async (path: string) => {
		if (excludedNames.has(path)) {
			excluded.push(path);
			return;
		}
		const absolute = join(source, path);
		const stat = await lstat(absolute);
		const base = { path, bytes: stat.size, mode: stat.mode & 0o777 };
		if (stat.isSymbolicLink()) {
			if (!path.startsWith("agents/")) throw new Error(`Only workspace symlinks can be imported: ${path}.`);
			const link = await readlink(absolute);
			const linkPath = resolve(dirname(absolute), link);
			const resolvedLink = canonicalTarget(linkPath);
			if (inside(target, resolvedLink) || inside(resolvedLink, target))
				throw new Error(`Workspace symlink ${path} points into the target home.`);
			entries.push({
				...base,
				kind: "symlink",
				link,
				copyLink: !isAbsolute(link) && !inside(source, resolvedLink) ? linkPath : link,
			});
		} else if (stat.isDirectory()) {
			entries.push({ ...base, bytes: 0, kind: "directory" });
			for (const child of (await readdir(absolute)).sort()) await visit(join(path, child));
		} else if (stat.isFile()) entries.push({ ...base, kind: "file", sha256: await hashPath(absolute) });
		else throw new Error(`Unsupported source entry ${path}. Stop its owner before import.`);
	};
	for (const path of (await readdir(source)).sort()) await visit(path);
	return {
		entries,
		excluded,
		version: version(entries),
		bytes: entries.reduce((total, entry) => total + entry.bytes, 0),
	};
};
