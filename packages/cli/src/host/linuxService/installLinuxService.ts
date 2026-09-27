import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { hostEnvironment, environmentFile } from "./configuration.ts";
import { linuxServicePaths } from "./paths.ts";
import { readLinuxRelease } from "./release.ts";
import { hostSystemdUnit, runtimeSystemdUnit } from "./systemdUnits.ts";
import { runSystemctl } from "./systemctl.ts";
import type {
	LinuxServiceDependencies,
	LinuxServiceInstallation,
	LinuxServiceInstallInput,
} from "./types.ts";

const tokenOf = async (path: string, randomToken: () => string) => {
	try {
		return (await readFile(path, "utf8")).trim();
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		return randomToken();
	}
};

export const installLinuxService = async (
	input: LinuxServiceInstallInput,
	deps: LinuxServiceDependencies,
): Promise<LinuxServiceInstallation> => {
	await deps.preflight(input.releaseRoot, "systemd");
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
	const authToken = await tokenOf(paths.token, deps.randomToken);
	await mkdir(paths.configRoot, { recursive: true, mode: 0o700 });
	await chmod(paths.configRoot, 0o700);
	await mkdir(paths.unitRoot, { recursive: true });
	await mkdir(installation.dataHome, { recursive: true, mode: 0o700 });
	await chmod(installation.dataHome, 0o700);
	await mkdir(resolve(installation.dataHome, "runtime"), { recursive: true, mode: 0o700 });
	await chmod(resolve(installation.dataHome, "runtime"), 0o700);
	await writeFile(paths.token, `${authToken}\n`, { mode: 0o600 });
	await chmod(paths.token, 0o600);
	await writeFile(paths.environment, environmentFile(hostEnvironment(release, installation, authToken, deps.env)), {
		mode: 0o600,
	});
	await chmod(paths.environment, 0o600);
	await writeFile(paths.installation, `${JSON.stringify(installation, null, 2)}\n`, { mode: 0o600 });
	await chmod(paths.installation, 0o600);
	await writeFile(paths.runtimeUnit, runtimeSystemdUnit(release, installation), { mode: 0o644 });
	await writeFile(paths.hostUnit, hostSystemdUnit(release, installation, paths.environment), { mode: 0o644 });
	await runSystemctl(deps, ["daemon-reload"]);
	await runSystemctl(deps, ["enable", "trellis-runtime.service", "trellis-host.service"]);
	return installation;
};
