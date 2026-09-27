import type { LaunchSpec } from "@trellis/runtime-protocol";
import { linuxCgroupController } from "./linuxCgroupNode.ts";
import { createNodeLinuxProcessExitWatcher } from "./linuxProcessExitWatcher.ts";
import { logLinuxLifecycle } from "./logLinuxLifecycle.ts";

export const prepareLinuxAttempt = (attemptId: string, spec: LaunchSpec) =>
	linuxCgroupController.prepare(attemptId, spec);

export const registerLinuxAttempt = (attemptId: string, pid: number) =>
	linuxCgroupController.confirmJoinedAndUnfreeze(attemptId, pid);

export const discardLinuxAttempt = (attemptId: string) => linuxCgroupController.discard(attemptId);

export const stopLinuxProcessTree = async (pid: number): Promise<void> => linuxCgroupController.stop(pid);

export const createLinuxProcessExitWatcher = () =>
	createNodeLinuxProcessExitWatcher((pid) => linuxCgroupController.attemptForPid(pid), logLinuxLifecycle);
