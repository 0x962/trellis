import type { LaunchSpec } from "@trellis/runtime-protocol";
import type { LinuxAttempt } from "./cgroup.ts";
import { linuxCgroupController } from "./linuxCgroupNode.ts";

export const prepareLinuxAttempt = (attemptId: string, spec: LaunchSpec): LinuxAttempt =>
	linuxCgroupController.prepare(attemptId, spec);

export const stopLinuxProcessTree = async (pid: number): Promise<void> => linuxCgroupController.stop(pid);

export type {
	LinuxAttempt,
	LinuxCgroupController,
	LinuxCgroupOperations,
	LinuxCgroupWatcher,
} from "./cgroup.ts";
export { createLinuxCgroupController, linuxCgroupRoot } from "./cgroup.ts";
export type { LinuxLaunchOperations } from "./launcher.ts";
export { linuxLaunchSpec, resolveLinuxExecutable } from "./launcher.ts";
