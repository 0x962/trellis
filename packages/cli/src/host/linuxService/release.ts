import { readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import { HostReleaseManifestSchema } from "@trellis/api";
import type { LinuxRelease } from "./types.ts";

export const readLinuxRelease = async (
	releaseRoot: string,
	platform: NodeJS.Platform,
	arch: string,
): Promise<LinuxRelease> => {
	if (platform !== "linux") throw new Error(`Linux host services require Linux. This host is ${platform}.`);
	const root = await realpath(releaseRoot);
	const manifest = HostReleaseManifestSchema.parse(JSON.parse(await readFile(join(root, "release.json"), "utf8")));
	if (manifest.target.platform !== "linux")
		throw new Error(`The host release targets ${manifest.target.platform}, not Linux.`);
	if (manifest.target.arch !== arch)
		throw new Error(`The host release targets ${manifest.target.arch}, but this host is ${arch}.`);
	return { root, manifest };
};
