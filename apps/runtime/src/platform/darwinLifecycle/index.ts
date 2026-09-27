import { DarwinProcessExitWatcher } from "./processExitWatcher.ts";

export const createDarwinProcessExitWatcher = () => new DarwinProcessExitWatcher();

export { stopDarwinProcessTree } from "./stopProcessTree.ts";
