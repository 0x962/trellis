import { runSystemctl, unitsFor } from "./systemctl.ts";
import type { LinuxServiceDependencies, LinuxServiceSelection } from "./types.ts";

export const stopLinuxService = async (
	selection: LinuxServiceSelection,
	deps: Pick<LinuxServiceDependencies, "run">,
): Promise<void> => {
	for (const service of unitsFor(selection, "stop"))
		await runSystemctl(deps, ["stop", `trellis-${service}.service`]);
};
