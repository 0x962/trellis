import { lstat, readlink, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import type { RuntimeLaunchCaptureProviderRoot } from "@trellis/runtime-protocol";
import type { BuiltInHarness } from "../../../agents/harnesses/types";

const directories: Record<BuiltInHarness, string[]> = {
	claude: ["projects"],
	codex: ["sessions", "archived_sessions"],
	pi: ["sessions"],
	muse: ["muse/sessions"],
	opencode: [],
};

export async function canonicalMutationPath(path: string): Promise<string> {
	try {
		return await realpath(path);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		const parent = dirname(resolve(path));
		return join(await canonicalMutationPath(parent), resolve(path).slice(parent.length + 1));
	}
}

export async function providerRoots(harness: BuiltInHarness, profilePath: string) {
	if (!isAbsolute(profilePath)) return { profilePath: null, paths: [], roots: [] };
	const profile = await canonicalMutationPath(profilePath);
	const roots: RuntimeLaunchCaptureProviderRoot[] = [];
	const paths = [resolve(profilePath), profile];
	for (const name of directories[harness]) {
		const externalLinks: RuntimeLaunchCaptureProviderRoot["externalLinks"] = [];
		let current = profilePath;
		for (const segment of name.split("/")) {
			current = join(current, segment);
			const entry = await lstat(current).catch((error: NodeJS.ErrnoException) => {
				if (error.code !== "ENOENT") throw error;
				return null;
			});
			if (entry?.isSymbolicLink()) {
				const target = resolve(dirname(current), await readlink(current));
				externalLinks.push({ path: current, target });
			}
		}
		const path = await canonicalMutationPath(join(profilePath, name));
		paths.push(join(profilePath, name), path);
		roots.push({ contentKind: "conversation-directory", sourceKind: "account-profile", path, externalLinks });
	}
	return { profilePath: profile, paths: [...new Set(paths)].sort(), roots };
}
