import { parseSystemdStatus, runSystemctl } from "../systemctl/index.ts";
import type { LinuxServiceDependencies, LinuxServiceName, LinuxServiceStatus } from "../types/index.ts";

const statusOf = async (service: LinuxServiceName, deps: Pick<LinuxServiceDependencies, "run">) => {
	const result = await runSystemctl(deps, [
		"show",
		"--property=ActiveState",
		"--property=SubState",
		"--property=MainPID",
		`trellis-${service}.service`,
	]);
	return parseSystemdStatus(result.stdout);
};

export const statusLinuxService = async (
	deps: Pick<LinuxServiceDependencies, "run">,
): Promise<LinuxServiceStatus> => ({
	host: await statusOf("host", deps),
	runtime: await statusOf("runtime", deps),
});
