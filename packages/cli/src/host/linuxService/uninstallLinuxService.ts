import { rm } from "node:fs/promises";
import { linuxServicePaths } from "./paths.ts";
import { runSystemctl } from "./systemctl.ts";
import type { LinuxServiceDependencies } from "./types.ts";

export const uninstallLinuxService = async (deps: Pick<LinuxServiceDependencies, "home" | "run">): Promise<void> => {
	const paths = linuxServicePaths(deps.home);
	await runSystemctl(deps, ["disable", "--now", "trellis-host.service", "trellis-runtime.service"]);
	await rm(paths.hostUnit);
	await rm(paths.runtimeUnit);
	await rm(paths.environment);
	await rm(paths.installation);
	await rm(paths.token);
	await runSystemctl(deps, ["daemon-reload"]);
};
