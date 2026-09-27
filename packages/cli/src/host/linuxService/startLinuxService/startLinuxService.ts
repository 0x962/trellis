import { orderedServicesFor, runSystemctl } from "../systemctl/index.ts";
import type { LinuxServiceDependencies, LinuxServiceSelection } from "../types/index.ts";

export const startLinuxService = async (
	selection: LinuxServiceSelection,
	deps: Pick<LinuxServiceDependencies, "run">,
): Promise<void> => {
	for (const service of orderedServicesFor(selection, "start"))
		await runSystemctl(deps, ["start", `trellis-${service}.service`]);
};
