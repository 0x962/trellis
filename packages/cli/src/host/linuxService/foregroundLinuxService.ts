import { join, resolve } from "node:path";
import { hostEnvironment } from "./configuration.ts";
import { linuxServicePaths } from "./paths.ts";
import { readLinuxRelease } from "./release.ts";
import type {
	LinuxForegroundCommand,
	LinuxForegroundInput,
	LinuxServiceDependencies,
	LinuxServiceInstallation,
} from "./types.ts";

export const foregroundLinuxService = async (
	input: LinuxForegroundInput,
	deps: Pick<LinuxServiceDependencies, "platform" | "arch" | "home" | "env" | "preflight">,
): Promise<LinuxForegroundCommand> => {
	await deps.preflight(input.releaseRoot, "foreground");
	const release = await readLinuxRelease(input.releaseRoot, deps.platform, deps.arch);
	const paths = linuxServicePaths(deps.home);
	const installation: LinuxServiceInstallation = {
		schemaVersion: 1,
		releaseRoot: release.root,
		releaseId: release.manifest.releaseId,
		dataHome: resolve(input.dataHome ?? paths.defaultDataHome),
		host: input.host ?? "127.0.0.1",
		port: input.port ?? 4521,
	};
	const path = [join(release.root, "bin"), deps.env.PATH].filter(Boolean).join(":");
	if (input.service === "runtime") {
		return {
			executable: join(release.root, release.manifest.entrypoints.runtime),
			args: ["--home", join(installation.dataHome, "runtime")],
			env: {
				...Object.fromEntries(
					Object.entries(deps.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
				),
				PATH: path,
				TRELLIS_RELEASE_ID: release.manifest.releaseId,
			},
		};
	}
	if (!input.authToken) throw new Error("The foreground host requires --auth-token-file.");
	return {
		executable: join(release.root, release.manifest.entrypoints.server),
		args: [],
		env: {
			...Object.fromEntries(
				Object.entries(deps.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
			),
			...hostEnvironment(release, installation, input.authToken, deps.env),
			PATH: path,
		},
	};
};
