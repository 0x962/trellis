import type { LaunchSpec } from "@trellis/runtime-protocol";
import type { ProcessIdentityObservation, ProcessSessionObservation } from "../runtimePlatform.ts";
import { createLinuxCgroupLifecycle, type LinuxCgroupOperations, type LinuxLaunchSweep } from "./cgroupLifecycle.ts";
import { homeTag } from "./cgroupPaths.ts";

export const runtimeCgroup = "/sys/fs/cgroup/user.slice/user-1001.slice/user@1001.service/app.slice/runtime.scope";
export const home = "/home/runner/.trellis/runtime";
export const attempts = `${runtimeCgroup}/trellis-attempts`;
export const root = `${attempts}/${homeTag(home)}`;
export const spec: LaunchSpec = {
	id: "attempt-one",
	command: "/bin/agent",
	args: ["--work"],
	cwd: "/work",
	mode: "stdio",
};

// An in-memory cgroup tree and process table for the cgroup lifecycle.
export function fixture() {
	const files = new Map<string, string>([
		["/proc/self/cgroup", "0::/user.slice/user-1001.slice/user@1001.service/app.slice/runtime.scope\n"],
		["/proc/self/mountinfo", "36 25 0:32 / /sys/fs/cgroup rw,nosuid - cgroup2 cgroup2 rw,nsdelegate\n"],
	]);
	const directories = new Set<string>([runtimeCgroup]);
	const writable = new Set<string>([runtimeCgroup, `${runtimeCgroup}/cgroup.procs`]);
	const writes: string[] = [];
	const logged: LinuxLaunchSweep[] = [];
	let session: ProcessSessionObservation = { kind: "empty" };
	let leader: ProcessIdentityObservation = { kind: "missing" };
	let clock = 0;
	const makeCgroup = (path: string) => {
		directories.add(path);
		files.set(`${path}/cgroup.kill`, "");
		files.set(`${path}/cgroup.events`, "populated 0\nfrozen 0\n");
		files.set(`${path}/cgroup.procs`, "");
	};
	const operations: LinuxCgroupOperations = {
		readFile(path) {
			const value = files.get(path);
			if (value === undefined) throw Object.assign(new Error(`missing ${path}`), { code: "ENOENT" });
			return value;
		},
		writeFile(path, value) {
			writes.push(`${path}=${value}`);
			files.set(path, value);
		},
		makeDirectory: makeCgroup,
		exists: (path) => directories.has(path) || files.has(path),
		isWritable: (path) => writable.has(path),
		canExecute: (path) => path === "/usr/bin/agent",
		listDirectories: (path) =>
			[...directories]
				.filter((entry) => entry.startsWith(`${path}/`) && !entry.slice(path.length + 1).includes("/"))
				.map((entry) => entry.slice(path.length + 1)),
		removeDirectory(path) {
			if (files.get(`${path}/cgroup.events`)?.includes("populated 1")) throw new Error(`${path} is busy`);
			directories.delete(path);
		},
		processIdentity: () => leader,
		inspectProcessSession: () => session,
		runtimePid: 7,
		launchName: () => "launch-one",
		log: (event) => logged.push(event),
		now: () => clock,
		async wait(milliseconds) {
			clock += milliseconds;
		},
	};
	return {
		files,
		directories,
		writable,
		writes,
		logged,
		makeCgroup,
		operations,
		setSession: (value: ProcessSessionObservation) => {
			session = value;
		},
		setLeader: (value: ProcessIdentityObservation) => {
			leader = value;
		},
		// A lifecycle bound to `home`.
		lifecycle: () => {
			const lifecycle = createLinuxCgroupLifecycle(operations);
			lifecycle.useHome(home);
			return lifecycle;
		},
		// The cgroup argument is an absolute path below /sys/fs/cgroup. The
		// process record stores the path relative to that mount.
		placeProcess: (pid: number, cgroup: string) => {
			files.set(`/proc/${pid}/cgroup`, `0::${cgroup.slice("/sys/fs/cgroup".length)}\n`);
		},
	};
}

export const launch = `${root}/launch-one`;
export const liveLeader = (parentPid: number): ProcessIdentityObservation => ({
	kind: "live",
	process: { pid: 42, parentPid, groupId: 42, identity: "linux:boot:42:1", startedAt: "2026-10-10T00:00:00.000Z" },
});
