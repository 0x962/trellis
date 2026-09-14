import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readdir, readFile, readlink, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

export type BundleManifest = { id: string; version: string; protocol: number };
const manifestName = "release.json";
const inside = (root: string, path: string) => {
	const suffix = relative(root, path);
	return suffix !== ".." && !suffix.startsWith("../") && !isAbsolute(suffix);
};

export const hashBundle = async (root: string, version: string, protocol: number): Promise<string> => {
	const canonical = await realpath(root);
	const hash = createHash("sha256");
	hash.update(JSON.stringify({ version, protocol }));
	const visit = async (directory: string) => {
		for (const name of (await readdir(directory)).sort()) {
			const path = join(directory, name);
			if (directory === canonical && name === manifestName) continue;
			const stat = await lstat(path);
			hash.update(JSON.stringify([relative(canonical, path), stat.isDirectory() ? 0 : stat.mode & 0o111]));
			if (stat.isSymbolicLink()) {
				const target = await readlink(path);
				if (isAbsolute(target) || !inside(canonical, resolve(dirname(path), target)))
					throw new Error(`The resource link points outside the package: ${path}`);
				if (!inside(canonical, await realpath(path)))
					throw new Error(`The resource link resolves outside the package: ${path}`);
				hash.update(`link:${target}`);
			} else if (stat.isDirectory()) {
				hash.update("directory");
				await visit(path);
			} else if (stat.isFile()) {
				hash.update(`file:${stat.size}:`);
				for await (const chunk of createReadStream(path)) hash.update(chunk);
			} else throw new Error(`Unsupported resource file: ${path}`);
		}
	};
	await visit(canonical);
	return hash.digest("hex");
};

export const readBundleManifest = async (root: string): Promise<BundleManifest> =>
	JSON.parse(await readFile(join(root, manifestName), "utf8"));

export const writeBundleManifest = async (root: string, version: string, protocol: number): Promise<BundleManifest> => {
	const manifest = { id: await hashBundle(root, version, protocol), version, protocol };
	await writeFile(join(root, manifestName), `${JSON.stringify(manifest)}\n`);
	return manifest;
};
