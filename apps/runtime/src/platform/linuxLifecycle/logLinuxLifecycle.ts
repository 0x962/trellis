import type { LinuxLifecycleEvent } from "./cgroup.ts";

export const logLinuxLifecycle = (event: LinuxLifecycleEvent) => {
	process.stderr.write(`${JSON.stringify({ at: new Date().toISOString(), type: "linux-lifecycle", ...event })}\n`);
};
