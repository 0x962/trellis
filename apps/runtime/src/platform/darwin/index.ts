import { load } from "koffi";
import type { RuntimePlatform } from "../runtimePlatform.ts";
import { attemptProcesses } from "./attemptProcesses.ts";
import { inspectProcess } from "./inspectProcess.ts";
import { inspectProcessSession } from "./inspectProcessSession.ts";
import { DarwinProcessExitWatcher } from "./processExitWatcher.ts";
import { processIdentity } from "./processIdentity.ts";
import { stopProcessTree } from "./stopProcessTree.ts";

const library = load(null);
const sessionOf = library.func("int getsid(int pid)");

// macOS launches need no preparation. A launch creates an OS session, and
// `stopProcessTree` stops the process groups of that session.
export const darwinPlatform: RuntimePlatform = {
	inspectProcess,
	processIdentity,
	inspectProcessSession,
	sessionOf: (pid) => sessionOf(pid),
	attemptProcesses,
	createExitWatcher: () => new DarwinProcessExitWatcher(),
	prepareLaunch: (spec) => ({ spec, started: () => {} }),
	stopProcessTree,
};
