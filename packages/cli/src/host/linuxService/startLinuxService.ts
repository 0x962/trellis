import { runSystemctl, unitsFor } from "./systemctl.ts";
import type { LinuxServiceDependencies, LinuxServiceSelection } from "./types.ts";

export const startLinuxService = async (
	selection: LinuxServiceSelection,
	deps: Pick<LinuxServiceDependencies, "run">,
): Promise<void> => {
	for (const service of unitsFor(selection, "start"))
		await runSystemctl(deps, ["start", `trellis-${service}.service`]);
};
