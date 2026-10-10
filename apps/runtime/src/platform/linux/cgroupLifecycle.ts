import { posix } from "node:path";
import type { LaunchSpec } from "@trellis/runtime-protocol";
import type { PreparedLaunch, ProcessIdentityObservation, ProcessSessionObservation } from "../runtimePlatform.ts";
import { wrapLinuxLaunch } from "./launchWrapper.ts";

export type LinuxCgroupOperations = {
	readFile: (path: string) => string;
	writeFile: (path: string, value: string) => void;
	// Creates the directory and its parents. An existing directory is kept.
	makeDirectory: (path: string) => void;
	exists: (path: string) => boolean;
	isWritable: (path: string) => boolean;
	canExecute: (path: string) => boolean;
	listDirectories: (path: string) => string[];
	removeDirectory: (path: string) => void;
	processIdentity: (pid: number) => ProcessIdentityObservation;
	inspectProcessSession: (sessionId: number) => ProcessSessionObservation;
	runtimePid: number;
	// Answers a name that no earlier launch used.
	launchName: () => string;
	now: () => number;
	wait: (milliseconds: number) => Promise<void>;
};

export type LinuxCgroupLifecycle = {
	prepareLaunch: (spec: LaunchSpec) => PreparedLaunch;
	stopProcessTree: (sessionId: number) => Promise<void>;
	attemptsRoot: () => string;
};

const stopDeadlineMs = 2000;
const stopPollMs = 20;

const decodeMountPath = (value: string) =>
	value.replace(/\\([0-7]{3})/g, (_match, digits: string) => String.fromCharCode(Number.parseInt(digits, 8)));

// /proc/self/cgroup names the cgroup v2 path of the runtime on its "0::" line.
// mountinfo(5) maps that path to a directory of the cgroup2 mount.
export function linuxCgroupDirectory(cgroup: string, mountInfo: string): string {
	const membership = cgroup
		.split("\n")
		.map((line) => line.split(":"))
		.find(([hierarchy, controllers]) => hierarchy === "0" && controllers === "");
	if (membership === undefined || membership[2] === undefined)
		throw new Error("the runtime has no cgroup v2 membership");
	const current = decodeMountPath(membership.slice(2).join(":"));
	for (const line of mountInfo.split("\n")) {
		const [mount, filesystem] = line.split(" - ");
		if (mount === undefined || filesystem?.split(" ")[0] !== "cgroup2") continue;
		const fields = mount.split(" ");
		const root = decodeMountPath(fields[3]!);
		const mountPoint = decodeMountPath(fields[4]!);
		if (current !== root && !current.startsWith(root === "/" ? "/" : `${root}/`)) continue;
		return posix.join(mountPoint, current.slice(root.length));
	}
	throw new Error(`no cgroup2 mount contains ${current}`);
}

const populated = (events: string) => {
	const match = /^populated\s+([01])$/m.exec(events);
	if (match === null) throw new Error("The cgroup events file has no populated state");
	return match[1] === "1";
};

const absent = (error: unknown) => {
	const code = (error as NodeJS.ErrnoException).code;
	return code === "ENOENT" || code === "ESRCH";
};

// Each launch runs in its own cgroup, a child of the runtime cgroup. A
// descendant cannot leave a cgroup by a fork, by setsid(2), or by the exit of
// its parent, so an empty cgroup confirms that every descendant exited.
export function createLinuxCgroupLifecycle(operations: LinuxCgroupOperations): LinuxCgroupLifecycle {
	// The cgroup of each launch of this runtime, by the session ID of its leader.
	// A runtime that starts later finds a cgroup through /proc/<pid>/cgroup of a
	// live process in it.
	const launches = new Map<number, string>();

	const runtimeCgroup = () =>
		linuxCgroupDirectory(operations.readFile("/proc/self/cgroup"), operations.readFile("/proc/self/mountinfo"));
	const attemptsRoot = () => posix.join(runtimeCgroup(), "trellis-attempts");

	// The launch shell moves itself from the runtime cgroup into a child cgroup.
	// cgroup v2 permits that move only for a user who can write cgroup.procs of
	// the runtime cgroup, which a delegated subtree grants.
	const delegatedAttemptsRoot = () => {
		const refuse = (reason: string) =>
			new Error(`Linux agent launch requires a delegated cgroup v2 subtree: ${reason}`);
		let root: string;
		try {
			root = attemptsRoot();
		} catch (error) {
			throw refuse((error as Error).message);
		}
		const runtime = posix.dirname(root);
		if (!operations.isWritable(runtime) || !operations.isWritable(posix.join(runtime, "cgroup.procs")))
			throw refuse(`this user cannot create cgroups or move processes in ${runtime}`);
		try {
			operations.makeDirectory(root);
		} catch (error) {
			throw refuse(`cannot create ${root}: ${(error as Error).message}`);
		}
		if (!operations.exists(posix.join(root, "cgroup.kill")))
			throw refuse(`${root} has no cgroup.kill, which requires Linux 5.14 or later`);
		return root;
	};

	// Answers the launch cgroup that holds the process, or undefined when the
	// process exited or runs outside every launch cgroup of this runtime.
	const launchCgroupOf = (pid: number, root: string, mountInfo: string) => {
		let membership: string;
		try {
			membership = operations.readFile(`/proc/${pid}/cgroup`);
		} catch (error) {
			if (absent(error)) return undefined;
			throw error;
		}
		const directory = linuxCgroupDirectory(membership, mountInfo);
		if (!directory.startsWith(`${root}/`)) return undefined;
		return posix.join(root, directory.slice(root.length + 1).split("/")[0]!);
	};

	const removeTree = (path: string) => {
		for (const child of operations.listDirectories(path)) removeTree(posix.join(path, child));
		operations.removeDirectory(path);
	};

	return {
		attemptsRoot,
		prepareLaunch(spec) {
			const cgroup = posix.join(delegatedAttemptsRoot(), operations.launchName());
			return {
				spec: wrapLinuxLaunch(spec, cgroup, operations.canExecute),
				started: (pid) => launches.set(pid, cgroup),
			};
		},
		// The stop covers the cgroup of the launch with this session ID and the
		// launch cgroup of each live process of the session. A launch reaches its
		// cgroup in steps: fork, setsid(2), and the move by the launch shell. A
		// live leader that is a child of this runtime keeps the stop going, and a
		// later pass kills it inside its cgroup.
		async stopProcessTree(sessionId) {
			const root = attemptsRoot();
			const cgroups = new Set<string>();
			const registered = launches.get(sessionId);
			if (registered !== undefined) cgroups.add(registered);
			const deadline = operations.now() + stopDeadlineMs;
			for (;;) {
				const leader = operations.processIdentity(sessionId);
				if (leader.kind === "unknown") throw new Error(leader.error);
				const members = operations.inspectProcessSession(sessionId);
				if (members.kind === "unknown") throw new Error(members.error);
				const remaining = members.kind === "live" ? members.pids : [];
				const live = leader.kind === "live" && !remaining.includes(sessionId) ? [sessionId, ...remaining] : remaining;
				const mountInfo = operations.readFile("/proc/self/mountinfo");
				for (const pid of live) {
					const cgroup = launchCgroupOf(pid, root, mountInfo);
					if (cgroup !== undefined) cgroups.add(cgroup);
				}
				if (
					leader.kind === "live" &&
					leader.process.parentPid === operations.runtimePid &&
					!remaining.includes(sessionId)
				)
					remaining.push(sessionId);
				if (cgroups.size === 0 && remaining.length > 0)
					throw new Error(
						`Process session ${sessionId} has live processes outside every attempt cgroup: ${remaining.join(", ")}`,
					);
				let busy: string | undefined;
				for (const cgroup of cgroups) {
					if (!operations.exists(cgroup)) continue;
					operations.writeFile(posix.join(cgroup, "cgroup.kill"), "1");
					if (populated(operations.readFile(posix.join(cgroup, "cgroup.events")))) busy = cgroup;
				}
				if (busy === undefined && remaining.length === 0) {
					for (const cgroup of cgroups) if (operations.exists(cgroup)) removeTree(cgroup);
					launches.delete(sessionId);
					return;
				}
				if (operations.now() >= deadline)
					throw new Error(
						busy === undefined
							? `Process session ${sessionId} has live processes outside its attempt cgroup: ${remaining.join(", ")}`
							: `The cgroup ${busy} still has live processes after cgroup.kill`,
					);
				await operations.wait(stopPollMs);
			}
		},
	};
}
