import { randomUUID } from "node:crypto";
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
import { errno, load } from "koffi";
import type { RuntimePlatform } from "../runtimePlatform.ts";
import { createLinuxAttemptProcesses } from "./attemptProcesses.ts";
import { createLinuxCgroupLifecycle } from "./cgroupLifecycle.ts";
import { createLinuxProcessInspector } from "./linuxProcessInspector.ts";
import { exitWatcherSignatures, LinuxProcessExitWatcher, nodeExitWatcherOperations } from "./processExitWatcher.ts";

// The library and its functions stay referenced for the life of the process.
// Bun test crashes when it finalizes a koffi object.
const library = load(null);
const sysconf = library.func("long sysconf(int name)");
const exitWatcherNatives = {
	pidfdOpen: library.func(exitWatcherSignatures.pidfdOpen),
	epollCreate: library.func(exitWatcherSignatures.epollCreate),
	epollControl: library.func(exitWatcherSignatures.epollControl),
	epollWait: library.func(exitWatcherSignatures.epollWait),
	eventfd: library.func(exitWatcherSignatures.eventfd),
	errno,
};
// unistd.h defines _SC_CLK_TCK as 2 on Linux.
const clockTicks = Number(sysconf(2));

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
	launchName: () => `launch-${randomUUID()}`,
	log: (event) => console.error(JSON.stringify(event)),
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
	createExitWatcher: () => new LinuxProcessExitWatcher(nodeExitWatcherOperations(exitWatcherNatives)),
	prepareLaunch: linuxCgroupLifecycle.prepareLaunch,
	useRuntimeHome: linuxCgroupLifecycle.useHome,
	adoptProcess: linuxCgroupLifecycle.adopt,
	sweepLaunches: async () => {
		await linuxCgroupLifecycle.sweep();
	},
	stopProcessTree: linuxCgroupLifecycle.stopProcessTree,
};
