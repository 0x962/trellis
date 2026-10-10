import { expect, test } from "bun:test";
import type { LaunchSpec } from "@trellis/runtime-protocol";
import type { ProcessIdentityObservation, ProcessSessionObservation } from "../runtimePlatform.ts";
import { createLinuxCgroupLifecycle, type LinuxCgroupOperations, linuxCgroupDirectory } from "./cgroupLifecycle.ts";

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
	let session: ProcessSessionObservation = { kind: "empty" };
	let leader: ProcessIdentityObservation = { kind: "missing" };
	let clock = 0;
	const makeCgroup = (path: string) => {
		directories.add(path);
		files.set(`${path}/cgroup.kill`, "");
		files.set(`${path}/cgroup.events`, "populated 0\nfrozen 0\n");
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
		makeCgroup,
		operations,
		setSession: (value: ProcessSessionObservation) => {
			session = value;
		},
		setLeader: (value: ProcessIdentityObservation) => {
			leader = value;
		},
	};
}

test("the cgroup directory follows a cgroup namespace mount root", () => {
	expect(
		linuxCgroupDirectory(
			"0::/user.slice/runtime.scope\n",
			"36 25 0:32 /user.slice /sys/fs/cgroup/user rw - cgroup2 cgroup rw\n",
		),
	).toBe("/sys/fs/cgroup/user/runtime.scope");
	expect(linuxCgroupDirectory("0::/\n", "36 25 0:32 / /sys/fs/cgroup rw - cgroup2 cgroup rw\n")).toBe("/sys/fs/cgroup");
});

test("a launch runs the agent through a shell that joins the cgroup of its session", () => {
	const state = fixture();
	const launch = createLinuxCgroupLifecycle(state.operations).prepareLaunch({
		...spec,
		command: "agent",
		env: { PATH: "/usr/bin" },
	});
	expect(launch.command).toBe("/bin/sh");
	expect(launch.args.slice(2)).toEqual(["trellis-attempt", root, "/usr/bin/agent", "--work"]);
	expect(state.directories.has(root)).toBe(true);
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

test("a stop kills the session cgroup and removes it after the cgroup is empty", async () => {
	const state = fixture();
	const path = `${root}/session-42`;
	state.makeCgroup(root);
	state.makeCgroup(path);
	state.makeCgroup(`${path}/nested`);
	state.files.set(`${path}/cgroup.events`, "populated 1\nfrozen 0\n");
	const lifecycle = createLinuxCgroupLifecycle(state.operations);
	let passes = 0;
	state.operations.wait = async () => {
		passes++;
		state.files.set(`${path}/cgroup.events`, "populated 0\nfrozen 0\n");
	};
	await lifecycle.stopProcessTree(42);
	expect(state.writes).toContain(`${path}/cgroup.kill=1`);
	expect(passes).toBe(1);
	expect(state.directories.has(path)).toBe(false);
	expect(state.directories.has(`${path}/nested`)).toBe(false);
});

test("a stop that cannot empty the cgroup stays unconfirmed and keeps the cgroup", async () => {
	const state = fixture();
	const path = `${root}/session-42`;
	state.makeCgroup(root);
	state.makeCgroup(path);
	state.files.set(`${path}/cgroup.events`, "populated 1\nfrozen 0\n");
	await expect(createLinuxCgroupLifecycle(state.operations).stopProcessTree(42)).rejects.toThrow(
		`The cgroup ${path} still has live processes after cgroup.kill`,
	);
	expect(state.directories.has(path)).toBe(true);
});

test("a stop before the launch shell joins its cgroup kills the shell on a later pass", async () => {
	const state = fixture();
	const path = `${root}/session-42`;
	state.makeCgroup(root);
	state.setSession({ kind: "live", pids: [42] });
	state.operations.wait = async () => {
		state.makeCgroup(path);
		state.setSession({ kind: "empty" });
	};
	await createLinuxCgroupLifecycle(state.operations).stopProcessTree(42);
	expect(state.writes).toContain(`${path}/cgroup.kill=1`);
	expect(state.directories.has(path)).toBe(false);
});

test("a session member outside the attempt cgroup leaves the stop unconfirmed", async () => {
	const state = fixture();
	state.makeCgroup(root);
	state.setSession({ kind: "live", pids: [42, 77] });
	await expect(createLinuxCgroupLifecycle(state.operations).stopProcessTree(42)).rejects.toThrow(
		"Process session 42 has live processes outside its attempt cgroup: 42, 77",
	);
});

test("a stop waits for a child of the runtime that has not reached its session yet", async () => {
	const state = fixture();
	const path = `${root}/session-42`;
	state.makeCgroup(root);
	const starting: ProcessIdentityObservation = {
		kind: "live",
		process: { pid: 42, parentPid: 7, groupId: 7, identity: "linux:boot:42:1", startedAt: "2026-10-10T00:00:00.000Z" },
	};
	state.setLeader(starting);
	let passes = 0;
	state.operations.wait = async () => {
		passes++;
		if (passes === 1) state.makeCgroup(path);
		else state.setLeader({ kind: "missing" });
	};
	await createLinuxCgroupLifecycle(state.operations).stopProcessTree(42);
	expect(passes).toBe(2);
	expect(state.writes).toContain(`${path}/cgroup.kill=1`);
	expect(state.directories.has(path)).toBe(false);
});
