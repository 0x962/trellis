import {
	accessSync,
	constants,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	readlinkSync,
	rmdirSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { load } from "koffi";
import type { RuntimePlatform } from "../runtimePlatform.ts";
import { createLinuxAttemptProcesses } from "./attemptProcesses.ts";
import { createLinuxCgroupLifecycle } from "./cgroupLifecycle.ts";
import { createLinuxProcessInspector } from "./linuxProcessInspector.ts";
import { LinuxProcessExitWatcher, nodeExitWatcherOperations } from "./processExitWatcher.ts";

// unistd.h defines _SC_CLK_TCK as 2 on Linux.
const clockTicks = Number(load(null).func("long sysconf(int name)")(2));

const accessible = (path: string, mode: number) => {
	try {
		accessSync(path, mode);
		return true;
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		if (code === "EACCES" || code === "ENOENT" || code === "ENOTDIR" || code === "EROFS") return false;
		throw error;
	}
};

const inspector = createLinuxProcessInspector({
	readFile: (path) => readFileSync(path, "utf8"),
	readLink: (path) => readlinkSync(path, "utf8"),
	readDirectory: (path) => readdirSync(path),
	clockTicks,
});

export const linuxCgroupLifecycle = createLinuxCgroupLifecycle({
	readFile: (path) => readFileSync(path, "utf8"),
	writeFile: (path, value) => writeFileSync(path, value),
	makeDirectory: (path) => {
		mkdirSync(path, { recursive: true });
	},
	exists: existsSync,
	isWritable: (path) => accessible(path, constants.W_OK),
	canExecute: (path) => accessible(path, constants.X_OK),
	listDirectories: (path) =>
		readdirSync(path, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name),
	removeDirectory: rmdirSync,
	processIdentity: inspector.processIdentity,
	inspectProcessSession: inspector.inspectProcessSession,
	runtimePid: process.pid,
	now: () => performance.now(),
	wait: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
});

// Linux launches require a delegated cgroup v2 subtree. `prepareLaunch`
// refuses a launch without one.
export const linuxPlatform: RuntimePlatform = {
	inspectProcess: inspector.inspectProcess,
	processIdentity: inspector.processIdentity,
	inspectProcessSession: inspector.inspectProcessSession,
	sessionOf: inspector.sessionOf,
	attemptProcesses: createLinuxAttemptProcesses({
		readDirectory: (path) => readdirSync(path),
		readFile: (path) => readFileSync(path, "utf8"),
		ownerOf: (path) => statSync(path).uid,
		uid: process.getuid!(),
		runtimePid: process.pid,
		processIdentity: inspector.processIdentity,
	}),
	createExitWatcher: () => new LinuxProcessExitWatcher(nodeExitWatcherOperations()),
	prepareLaunch: linuxCgroupLifecycle.prepareLaunch,
	stopProcessTree: linuxCgroupLifecycle.stopProcessTree,
};
