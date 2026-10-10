import { posix } from "node:path";
import type { LaunchSpec } from "@trellis/runtime-protocol";
import type { PreparedLaunch, ProcessIdentityObservation, ProcessSessionObservation } from "../runtimePlatform.ts";
import { cgroupV2Path, homeTag, linuxCgroupDirectory, populated } from "./cgroupPaths.ts";
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
	log: (event: LinuxLaunchSweep) => void;
	now: () => number;
	wait: (milliseconds: number) => Promise<void>;
};

export type LinuxLaunchSweep = {
	type: "linux-launch-sweep";
	cgroup: string;
	pids: number[];
	outcome: "removed" | "failed";
};

export type LinuxCgroupLifecycle = {
	// Binds the lifecycle to the runtime home before the first other call.
	useHome: (home: string) => void;
	adopt: (pid: number) => void;
	registeredCgroup: (sessionId: number) => string | undefined;
	sweep: () => Promise<LinuxLaunchSweep[]>;
	prepareLaunch: (spec: LaunchSpec) => PreparedLaunch;
	stopProcessTree: (sessionId: number) => Promise<void>;
	attemptsRoot: () => string;
	launchRoot: () => string;
};

const stopDeadlineMs = 2000;
const stopPollMs = 20;

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
	let tag: string | undefined;
	const launchRoot = () => {
		if (tag === undefined) throw new Error("The Linux cgroup lifecycle has no runtime home");
		return posix.join(attemptsRoot(), tag);
	};

	// The launch shell moves itself from the runtime cgroup into a child cgroup.
	// cgroup v2 permits that move only for a user who can write cgroup.procs of
	// the runtime cgroup, which a delegated subtree grants.
	const delegatedLaunchRoot = () => {
		const refuse = (reason: string) =>
			new Error(`Linux agent launch requires a delegated cgroup v2 subtree: ${reason}`);
		let root: string;
		try {
			root = launchRoot();
		} catch (error) {
			throw refuse((error as Error).message);
		}
		const runtime = posix.dirname(posix.dirname(root));
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

	const processesOf = (path: string): number[] => [
		...operations.readFile(posix.join(path, "cgroup.procs")).split("\n").filter(Boolean).map(Number),
		...operations.listDirectories(path).flatMap((child) => processesOf(posix.join(path, child))),
	];

	const isPopulated = (path: string) => populated(operations.readFile(posix.join(path, "cgroup.events")));

	return {
		useHome(home) {
			tag = homeTag(home);
		},
		attemptsRoot,
		launchRoot,
		// A recovered leader that adoptsRecoveredLeader accepts belongs to this
		// runtime, so its launch cgroup joins the registry.
		adopt(pid) {
			const root = launchRoot();
			const cgroup = launchCgroupOf(pid, root, operations.readFile("/proc/self/mountinfo"));
			if (cgroup !== undefined) launches.set(pid, cgroup);
		},
		registeredCgroup: (sessionId) => launches.get(sessionId),
		// Runs once after the runtime adopts its recovered launches. A launch
		// cgroup outside the registry belongs to no record: its leader died with
		// an earlier runtime, or a stop of that runtime did not finish. Its
		// processes can lack the attempt markers, so no other stop finds them.
		async sweep() {
			if (cgroupV2Path(operations.readFile("/proc/self/cgroup")) === undefined) return [];
			const root = launchRoot();
			if (!operations.exists(root)) return [];
			const registered = new Set(launches.values());
			const orphans = operations
				.listDirectories(root)
				.filter((name) => name.startsWith("launch-"))
				.map((name) => posix.join(root, name))
				.filter((cgroup) => !registered.has(cgroup));
			const swept = orphans.map((cgroup) => ({ cgroup, pids: processesOf(cgroup) }));
			for (const { cgroup } of swept) operations.writeFile(posix.join(cgroup, "cgroup.kill"), "1");
			const deadline = operations.now() + stopDeadlineMs;
			let busy = orphans.filter(isPopulated);
			while (busy.length > 0 && operations.now() < deadline) {
				await operations.wait(stopPollMs);
				busy = busy.filter(isPopulated);
			}
			return swept.map(({ cgroup, pids }) => {
				const failed = busy.includes(cgroup);
				if (!failed) removeTree(cgroup);
				const event: LinuxLaunchSweep = {
					type: "linux-launch-sweep",
					cgroup,
					pids,
					outcome: failed ? "failed" : "removed",
				};
				operations.log(event);
				return event;
			});
		},
		prepareLaunch(spec) {
			const cgroup = posix.join(delegatedLaunchRoot(), operations.launchName());
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
			const root = launchRoot();
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
