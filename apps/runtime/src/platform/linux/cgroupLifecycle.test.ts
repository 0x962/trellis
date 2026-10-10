import { expect, test } from "bun:test";
import type { LaunchSpec } from "@trellis/runtime-protocol";
import type { ProcessIdentityObservation, ProcessSessionObservation } from "../runtimePlatform.ts";
import {
	createLinuxCgroupLifecycle,
	type LinuxCgroupOperations,
	type LinuxLaunchSweep,
	linuxCgroupDirectory,
} from "./cgroupLifecycle.ts";

const runtimeCgroup = "/sys/fs/cgroup/user.slice/user-1001.slice/user@1001.service/app.slice/runtime.scope";
const root = `${runtimeCgroup}/trellis-attempts`;
const spec: LaunchSpec = { id: "attempt-one", command: "/bin/agent", args: ["--work"], cwd: "/work", mode: "stdio" };

function fixture() {
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
		// Places a process in a cgroup, given relative to the cgroup2 mount.
		placeProcess: (pid: number, cgroup: string) => {
			files.set(`/proc/${pid}/cgroup`, `0::${cgroup.slice("/sys/fs/cgroup".length)}\n`);
		},
	};
}

const launch = `${root}/launch-one`;
const liveLeader = (parentPid: number): ProcessIdentityObservation => ({
	kind: "live",
	process: { pid: 42, parentPid, groupId: 42, identity: "linux:boot:42:1", startedAt: "2026-10-10T00:00:00.000Z" },
});

test("the cgroup directory follows a cgroup namespace mount root", () => {
	expect(
		linuxCgroupDirectory(
			"0::/user.slice/runtime.scope\n",
			"36 25 0:32 /user.slice /sys/fs/cgroup/user rw - cgroup2 cgroup rw\n",
		),
	).toBe("/sys/fs/cgroup/user/runtime.scope");
	expect(linuxCgroupDirectory("0::/\n", "36 25 0:32 / /sys/fs/cgroup rw - cgroup2 cgroup rw\n")).toBe("/sys/fs/cgroup");
});

test("a launch runs the agent through a shell that creates and joins a new cgroup", () => {
	const state = fixture();
	const prepared = createLinuxCgroupLifecycle(state.operations).prepareLaunch({
		...spec,
		command: "agent",
		env: { PATH: "/usr/bin" },
	});
	expect(prepared.spec.command).toBe("/bin/sh");
	expect(prepared.spec.args.slice(2)).toEqual(["trellis-attempt", launch, "/usr/bin/agent", "--work"]);
	expect(state.directories.has(root)).toBe(true);
	expect(state.directories.has(launch)).toBe(false);
});

test("a hybrid cgroup v1 host refuses the launch", () => {
	const state = fixture();
	state.files.set("/proc/self/cgroup", "12:pids:/user.slice\n1:name=systemd:/user.slice\n");
	expect(() => createLinuxCgroupLifecycle(state.operations).prepareLaunch(spec)).toThrow(
		"Linux agent launch requires a delegated cgroup v2 subtree: the runtime has no cgroup v2 membership",
	);
});

test("a runtime cgroup without delegation refuses the launch", () => {
	const state = fixture();
	state.writable.delete(`${runtimeCgroup}/cgroup.procs`);
	expect(() => createLinuxCgroupLifecycle(state.operations).prepareLaunch(spec)).toThrow(
		`Linux agent launch requires a delegated cgroup v2 subtree: this user cannot create cgroups or move processes in ${runtimeCgroup}`,
	);
});

test("a kernel without cgroup.kill refuses the launch", () => {
	const state = fixture();
	state.operations.makeDirectory = (path) => state.directories.add(path);
	expect(() => createLinuxCgroupLifecycle(state.operations).prepareLaunch(spec)).toThrow(
		"requires Linux 5.14 or later",
	);
});

test("a stop of a launch kills its cgroup and removes it after the cgroup is empty", async () => {
	const state = fixture();
	const lifecycle = createLinuxCgroupLifecycle(state.operations);
	lifecycle.prepareLaunch(spec).started(42);
	state.makeCgroup(launch);
	state.makeCgroup(`${launch}/nested`);
	state.files.set(`${launch}/cgroup.events`, "populated 1\nfrozen 0\n");
	let passes = 0;
	state.operations.wait = async () => {
		passes++;
		state.files.set(`${launch}/cgroup.events`, "populated 0\nfrozen 0\n");
	};
	await lifecycle.stopProcessTree(42);
	expect(state.writes).toContain(`${launch}/cgroup.kill=1`);
	expect(passes).toBe(1);
	expect(state.directories.has(launch)).toBe(false);
	expect(state.directories.has(`${launch}/nested`)).toBe(false);
});

test("a stop by the session of a descendant kills the launch cgroup that contains it", async () => {
	const state = fixture();
	state.makeCgroup(root);
	state.makeCgroup(launch);
	state.files.set(`${launch}/cgroup.events`, "populated 1\nfrozen 0\n");
	state.placeProcess(77, launch);
	state.setSession({ kind: "live", pids: [77] });
	state.operations.wait = async () => {
		state.files.set(`${launch}/cgroup.events`, "populated 0\nfrozen 0\n");
		state.setSession({ kind: "empty" });
	};
	await createLinuxCgroupLifecycle(state.operations).stopProcessTree(77);
	expect(state.writes).toEqual([`${launch}/cgroup.kill=1`, `${launch}/cgroup.kill=1`]);
	expect(state.directories.has(launch)).toBe(false);
});

test("a stop of a session outside every launch cgroup fails at once", async () => {
	const state = fixture();
	state.makeCgroup(root);
	state.placeProcess(77, runtimeCgroup);
	state.setSession({ kind: "live", pids: [77] });
	await expect(createLinuxCgroupLifecycle(state.operations).stopProcessTree(77)).rejects.toThrow(
		"Process session 77 has live processes outside every attempt cgroup: 77",
	);
	expect(state.writes).toEqual([]);
});

test("a stop does not touch a cgroup of another launch with no process in the session", async () => {
	const state = fixture();
	const other = `${root}/launch-other`;
	state.makeCgroup(root);
	state.makeCgroup(other);
	state.files.set(`${other}/cgroup.events`, "populated 1\nfrozen 0\n");
	await createLinuxCgroupLifecycle(state.operations).stopProcessTree(42);
	expect(state.writes).toEqual([]);
	expect(state.directories.has(other)).toBe(true);
});

test("a stop that cannot empty the cgroup stays unconfirmed and keeps the cgroup", async () => {
	const state = fixture();
	const lifecycle = createLinuxCgroupLifecycle(state.operations);
	lifecycle.prepareLaunch(spec).started(42);
	state.makeCgroup(launch);
	state.files.set(`${launch}/cgroup.events`, "populated 1\nfrozen 0\n");
	await expect(lifecycle.stopProcessTree(42)).rejects.toThrow(
		`The cgroup ${launch} still has live processes after cgroup.kill`,
	);
	expect(state.directories.has(launch)).toBe(true);
});

test("a stop waits for a child of the runtime that has not reached its cgroup yet", async () => {
	const state = fixture();
	const lifecycle = createLinuxCgroupLifecycle(state.operations);
	lifecycle.prepareLaunch(spec).started(42);
	state.placeProcess(42, runtimeCgroup);
	state.setLeader(liveLeader(7));
	let passes = 0;
	state.operations.wait = async () => {
		passes++;
		if (passes === 1) {
			state.makeCgroup(launch);
			state.placeProcess(42, launch);
		} else state.setLeader({ kind: "missing" });
	};
	await lifecycle.stopProcessTree(42);
	expect(passes).toBe(2);
	expect(state.writes).toContain(`${launch}/cgroup.kill=1`);
	expect(state.directories.has(launch)).toBe(false);
});

test("a session member that left its launch cgroup leaves the stop unconfirmed", async () => {
	const state = fixture();
	const lifecycle = createLinuxCgroupLifecycle(state.operations);
	lifecycle.prepareLaunch(spec).started(42);
	state.makeCgroup(launch);
	state.placeProcess(43, runtimeCgroup);
	state.setSession({ kind: "live", pids: [43] });
	await expect(lifecycle.stopProcessTree(42)).rejects.toThrow(
		"Process session 42 has live processes outside its attempt cgroup: 43",
	);
});

test("an adopted leader registers its launch cgroup for a later stop", async () => {
	const state = fixture();
	state.makeCgroup(root);
	state.makeCgroup(launch);
	state.files.set(`${launch}/cgroup.events`, "populated 1\nfrozen 0\n");
	state.placeProcess(42, launch);
	const lifecycle = createLinuxCgroupLifecycle(state.operations);
	lifecycle.adopt(42);
	expect(lifecycle.registeredCgroup(42)).toBe(launch);
	// The leader exits, and only a process of another OS session stays in the cgroup.
	state.operations.wait = async () => {
		state.files.set(`${launch}/cgroup.events`, "populated 0\nfrozen 0\n");
	};
	await lifecycle.stopProcessTree(42);
	expect(state.writes).toContain(`${launch}/cgroup.kill=1`);
	expect(state.directories.has(launch)).toBe(false);
	expect(lifecycle.registeredCgroup(42)).toBeUndefined();
});

test("an adopted leader outside every launch cgroup registers nothing", () => {
	const state = fixture();
	state.makeCgroup(root);
	state.placeProcess(42, runtimeCgroup);
	const lifecycle = createLinuxCgroupLifecycle(state.operations);
	lifecycle.adopt(42);
	expect(lifecycle.registeredCgroup(42)).toBeUndefined();
});

test("the sweep kills an unregistered launch cgroup, waits until it is empty, and removes it", async () => {
	const state = fixture();
	const orphan = `${root}/launch-orphan`;
	state.makeCgroup(root);
	state.makeCgroup(orphan);
	state.files.set(`${orphan}/cgroup.procs`, "77\n");
	state.files.set(`${orphan}/cgroup.events`, "populated 1\nfrozen 0\n");
	state.operations.wait = async () => {
		state.files.set(`${orphan}/cgroup.events`, "populated 0\nfrozen 0\n");
	};
	const swept = await createLinuxCgroupLifecycle(state.operations).sweep();
	const removed: LinuxLaunchSweep = { type: "linux-launch-sweep", cgroup: orphan, pids: [77], outcome: "removed" };
	expect(swept).toEqual([removed]);
	expect(state.logged).toEqual([removed]);
	expect(state.writes).toEqual([`${orphan}/cgroup.kill=1`]);
	expect(state.directories.has(orphan)).toBe(false);
});

test("the sweep removes an empty leaked launch cgroup", async () => {
	const state = fixture();
	const leaked = `${root}/launch-leaked`;
	state.makeCgroup(root);
	state.makeCgroup(leaked);
	const swept = await createLinuxCgroupLifecycle(state.operations).sweep();
	expect(swept).toEqual([{ type: "linux-launch-sweep", cgroup: leaked, pids: [], outcome: "removed" }]);
	expect(state.directories.has(leaked)).toBe(false);
});

test("the sweep leaves an adopted launch cgroup alone", async () => {
	const state = fixture();
	state.makeCgroup(root);
	state.makeCgroup(launch);
	state.files.set(`${launch}/cgroup.procs`, "42\n");
	state.files.set(`${launch}/cgroup.events`, "populated 1\nfrozen 0\n");
	state.placeProcess(42, launch);
	const lifecycle = createLinuxCgroupLifecycle(state.operations);
	lifecycle.adopt(42);
	expect(await lifecycle.sweep()).toEqual([]);
	expect(state.writes).toEqual([]);
	expect(state.directories.has(launch)).toBe(true);
});

test("a sweep that cannot empty a cgroup logs the failure and keeps the cgroup", async () => {
	const state = fixture();
	const orphan = `${root}/launch-orphan`;
	state.makeCgroup(root);
	state.makeCgroup(orphan);
	state.files.set(`${orphan}/cgroup.procs`, "77\n");
	state.files.set(`${orphan}/cgroup.events`, "populated 1\nfrozen 0\n");
	const swept = await createLinuxCgroupLifecycle(state.operations).sweep();
	expect(swept).toEqual([{ type: "linux-launch-sweep", cgroup: orphan, pids: [77], outcome: "failed" }]);
	expect(state.directories.has(orphan)).toBe(true);
});

test("the sweep does nothing on a host without a cgroup v2 membership", async () => {
	const state = fixture();
	state.files.set("/proc/self/cgroup", "1:name=systemd:/user.slice\n");
	expect(await createLinuxCgroupLifecycle(state.operations).sweep()).toEqual([]);
});
