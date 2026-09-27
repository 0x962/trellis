import { posix } from "node:path";
import type { LaunchSpec } from "@trellis/runtime-protocol";
import { linuxLaunchSpec, type LinuxLaunchOperations } from "./launcher.ts";

export type LinuxCgroupWatcher = { close: () => void };

export type LinuxAttemptIdentity = {
	attemptId: string;
	pid: number;
	path: string;
};

export type LinuxLifecycleEvent = {
	attemptId: string;
	pid: number | null;
	cgroupPath: string;
	operation: "prepare" | "register" | "stop" | "pidfd-watch" | "watcher-close";
	outcome: "started" | "succeeded" | "failed";
	error: string | null;
};

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
	log: (event: LinuxLifecycleEvent) => void;
};

export type LinuxAttempt = {
	attemptId: string;
	path: string;
	spec: LaunchSpec;
};

export type LinuxCgroupController = {
	prepare: (attemptId: string, spec: LaunchSpec) => LinuxAttempt;
	confirmJoinedAndUnfreeze: (attemptId: string, pid: number) => void;
	discard: (attemptId: string) => void;
	stop: (pid: number) => Promise<void>;
	attemptForPid: (pid: number) => LinuxAttemptIdentity;
};

const cleanupTimeoutMs = 10_000;
const joinTimeoutMs = 2_000;
const attemptPrefix = "attempt-";

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

const attemptName = (attemptId: string) => `${attemptPrefix}${Buffer.from(attemptId).toString("base64url")}`;

const attemptIdFromName = (name: string) => Buffer.from(name.slice(attemptPrefix.length), "base64url").toString();

export function createLinuxCgroupController(operations: LinuxCgroupOperations): LinuxCgroupController {
	const attempts = new Map<number, LinuxAttemptIdentity>();

	const attemptsRoot = () =>
		posix.join(
			linuxCgroupRoot(operations.readFile("/proc/self/cgroup"), operations.readFile("/proc/self/mountinfo")),
			"trellis-attempts",
		);

	const pathForAttempt = (attemptId: string) => posix.join(attemptsRoot(), attemptName(attemptId));

	const log = (
		identity: { attemptId: string; pid: number | null; path: string },
		operation: LinuxLifecycleEvent["operation"],
		outcome: LinuxLifecycleEvent["outcome"],
		error: Error | null = null,
	) =>
		operations.log({
			attemptId: identity.attemptId,
			pid: identity.pid,
			cgroupPath: identity.path,
			operation,
			outcome,
			error: error?.message ?? null,
		});

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

	const attemptForPid = (pid: number): LinuxAttemptIdentity => {
		const known = attempts.get(pid);
		if (known !== undefined) return known;
		const root = attemptsRoot();
		for (const name of operations.listDirectories(root)) {
			if (!name.startsWith(attemptPrefix)) continue;
			const path = posix.join(root, name);
			const pids = operations.readFile(posix.join(path, "cgroup.procs")).split(/\s+/);
			if (!pids.includes(String(pid))) continue;
			const recovered = { attemptId: attemptIdFromName(name), pid, path };
			attempts.set(pid, recovered);
			return recovered;
		}
		throw new Error(`Process ${pid} has no attempt cgroup`);
	};

	return {
		prepare(attemptId, spec) {
			const path = pathForAttempt(attemptId);
			const identity = { attemptId, pid: null, path };
			log(identity, "prepare", "started");
			try {
				const launchSpec = linuxLaunchSpec(spec, posix.join(path, "cgroup.procs"), operations.launch);
				operations.makeDirectory(attemptsRoot(), true);
				operations.makeDirectory(path, false);
				try {
					operations.writeFile(posix.join(path, "cgroup.freeze"), "1");
				} catch (error) {
					operations.removeDirectory(path);
					throw error;
				}
				log(identity, "prepare", "succeeded");
				return { attemptId, path, spec: launchSpec };
			} catch (error) {
				log(identity, "prepare", "failed", error as Error);
				throw error;
			}
		},
		confirmJoinedAndUnfreeze(attemptId, pid) {
			const path = pathForAttempt(attemptId);
			const identity = { attemptId, pid, path };
			log(identity, "register", "started");
			try {
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
				attempts.set(pid, identity);
				operations.writeFile(posix.join(path, "cgroup.freeze"), "0");
				log(identity, "register", "succeeded");
			} catch (error) {
				log(identity, "register", "failed", error as Error);
				throw error;
			}
		},
		discard(attemptId) {
			const path = pathForAttempt(attemptId);
			if (populated(operations.readFile(posix.join(path, "cgroup.events"))))
				throw new Error(`The cgroup ${path} contains a process`);
			removeTree(path);
		},
		async stop(pid) {
			const identity = attemptForPid(pid);
			log(identity, "stop", "started");
			try {
				operations.writeFile(posix.join(identity.path, "cgroup.kill"), "1");
				await confirmEmpty(identity.path);
				removeTree(identity.path);
				attempts.delete(pid);
				log(identity, "stop", "succeeded");
			} catch (error) {
				log(identity, "stop", "failed", error as Error);
				throw error;
			}
		},
		attemptForPid,
	};
}
