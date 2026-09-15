import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, realpath, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { type BundleManifest, hashBundle, readBundleManifest } from "../resourceBundle/resourceBundle.ts";

export type PinnedRelease = { root: string; manifest: BundleManifest };
export const pinResources = async (source: string, userData: string): Promise<PinnedRelease> => {
	source = await realpath(source);
	const manifest = await readBundleManifest(source);
	if (!/^[a-f0-9]{64}$/.test(manifest.id)) throw new Error("The package release hash is invalid.");
	const releases = join(userData, "releases");
	await mkdir(releases, { recursive: true, mode: 0o700 });
	const root = join(releases, manifest.id);
	if (existsSync(root)) return { root, manifest: await readBundleManifest(root) };
	const pending = await mkdtemp(join(releases, ".pending-"));
	try {
		if ((await hashBundle(source, manifest.version, manifest.protocol)) !== manifest.id)
			throw new Error("The package release hash does not match its resource files.");
		await cp(source, pending, { recursive: true, verbatimSymlinks: true });
		if ((await hashBundle(pending, manifest.version, manifest.protocol)) !== manifest.id)
			throw new Error("The package release hash does not match its resource files.");
		try {
			await rename(pending, root);
		} catch (error) {
			if (!["EEXIST", "ENOTEMPTY"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
		}
		return { root, manifest };
	} finally {
		await rm(pending, { recursive: true, force: true });
	}
};
