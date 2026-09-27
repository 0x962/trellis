import { createHash } from "node:crypto";
import { posix } from "node:path";
import type { LaunchSpec } from "@trellis/runtime-protocol";
import { linuxLaunchSpec, type LinuxLaunchOperations } from "./launcher.ts";

export type LinuxCgroupWatcher = { close: () => void };

export type LinuxCgroupOperations = {
	readFile: (path: string) => string;
	writeFile: (path: string, value: string) => void;
	makeDirectory: (path: string, recursive: boolean) => void;
	listDirectories: (path: string) => string[];
	removeDirectory: (path: string) => void;
	watchFile: (path: string, change: () => void, failure: (error: Error) => void) => LinuxCgroupWatcher;
	setTimer: (listener: () => void, milliseconds: number) => ReturnType<typeof setTimeout>;
	clearTimer: (timer: ReturnType<typeof setTimeout>) => void;
	now: () => number;
	waitSync: (milliseconds: number) => void;
	launch: LinuxLaunchOperations;
};

export type LinuxAttempt = {
	path: string;
	spec: LaunchSpec;
	register: (pid: number) => void;
	discard: () => void;
};

export type LinuxCgroupController = {
	prepare: (attemptId: string, spec: LaunchSpec) => LinuxAttempt;
	stop: (pid: number) => Promise<void>;
};

const cleanupTimeoutMs = 10_000;
const joinTimeoutMs = 2_000;

const decodeMountPath = (value: string) =>
	value.replace(/\\([0-7]{3})/g, (_match, digits: string) => String.fromCharCode(Number.parseInt(digits, 8)));

export function linuxCgroupRoot(cgroup: string, mountInfo: string): string {
	const membership = cgroup
		.split("\n")
		.map((line) => line.split(":"))
		.find(([hierarchy, controllers]) => hierarchy === "0" && controllers === "");
	if (membership === undefined || membership[2] === undefined)
		throw new Error("The process has no cgroup v2 membership");
	const current = decodeMountPath(membership[2]);
	for (const line of mountInfo.split("\n")) {
		const [mount, filesystem] = line.split(" - ");
		if (mount === undefined || filesystem?.split(" ")[0] !== "cgroup2") continue;
		const fields = mount.split(" ");
		const root = decodeMountPath(fields[3]!);
		const mountPoint = decodeMountPath(fields[4]!);
		if (current !== root && !(root === "/" ? current.startsWith("/") : current.startsWith(`${root}/`))) continue;
		const relative = current.slice(root.length).replace(/^\/+/, "");
		return relative === "" ? mountPoint : posix.join(mountPoint, relative);
	}
	throw new Error(`The cgroup v2 mount does not contain ${current}`);
}

const populated = (value: string): boolean => {
	const match = /^populated\s+([01])$/m.exec(value);
	if (match === null) throw new Error("The cgroup events file has no populated state");
	return match[1] === "1";
};

const attemptName = (attemptId: string) => `attempt-${createHash("sha256").update(attemptId).digest("hex")}`;

export function createLinuxCgroupController(operations: LinuxCgroupOperations): LinuxCgroupController {
	const attempts = new Map<number, string>();

	const removeTree = (path: string) => {
		for (const child of operations.listDirectories(path)) removeTree(posix.join(path, child));
		operations.removeDirectory(path);
	};

	const confirmEmpty = (path: string) => {
		const eventsPath = posix.join(path, "cgroup.events");
		if (!populated(operations.readFile(eventsPath))) return Promise.resolve();
		return new Promise<void>((resolve, reject) => {
			let finished = false;
			const finish = (error?: Error) => {
				if (finished) return;
				finished = true;
				watcher.close();
				operations.clearTimer(timer);
				if (error === undefined) resolve();
				else reject(error);
			};
			const inspect = () => {
				try {
					if (!populated(operations.readFile(eventsPath))) finish();
				} catch (error) {
					finish(error as Error);
				}
			};
			const watcher = operations.watchFile(eventsPath, inspect, finish);
			const timer = operations.setTimer(
				() => finish(new Error(`The cgroup ${path} is not empty after cgroup.kill`)),
				cleanupTimeoutMs,
			);
			inspect();
		});
	};

	return {
		prepare(attemptId, spec) {
			const delegated = linuxCgroupRoot(
				operations.readFile("/proc/self/cgroup"),
				operations.readFile("/proc/self/mountinfo"),
			);
			const attemptsRoot = posix.join(delegated, "trellis-attempts");
			const path = posix.join(attemptsRoot, attemptName(attemptId));
			const launchSpec = linuxLaunchSpec(spec, posix.join(path, "cgroup.procs"), operations.launch);
			operations.makeDirectory(attemptsRoot, true);
			operations.makeDirectory(path, false);
			try {
				operations.writeFile(posix.join(path, "cgroup.freeze"), "1");
			} catch (error) {
				operations.removeDirectory(path);
				throw error;
			}
			return {
				path,
				spec: launchSpec,
				register(pid) {
					const procsPath = posix.join(path, "cgroup.procs");
					const deadline = operations.now() + joinTimeoutMs;
					while (!operations.readFile(procsPath).split(/\s+/).includes(String(pid))) {
						if (operations.now() >= deadline) throw new Error(`Process ${pid} did not join the attempt cgroup`);
						operations.waitSync(1);
					}
					if (attempts.has(pid)) {
						operations.writeFile(posix.join(path, "cgroup.kill"), "1");
						throw new Error(`Process ${pid} already has an attempt cgroup`);
					}
					attempts.set(pid, path);
					operations.writeFile(posix.join(path, "cgroup.freeze"), "0");
				},
				discard() {
					if (populated(operations.readFile(posix.join(path, "cgroup.events"))))
						throw new Error(`The cgroup ${path} contains a process`);
					removeTree(path);
				},
			};
		},
		async stop(pid) {
			const path = attempts.get(pid);
			if (path === undefined) throw new Error(`Process ${pid} has no attempt cgroup`);
			operations.writeFile(posix.join(path, "cgroup.kill"), "1");
			await confirmEmpty(path);
			removeTree(path);
			attempts.delete(pid);
		},
	};
}
