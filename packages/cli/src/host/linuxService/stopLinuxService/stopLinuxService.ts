import { orderedServicesFor, runSystemctl } from "../systemctl/index.ts";
import type { LinuxServiceDependencies, LinuxServiceSelection } from "../types/index.ts";

export const stopLinuxService = async (
	selection: LinuxServiceSelection,
	deps: Pick<LinuxServiceDependencies, "run">,
): Promise<void> => {
	for (const service of orderedServicesFor(selection, "stop"))
		await runSystemctl(deps, ["stop", `trellis-${service}.service`]);
};
