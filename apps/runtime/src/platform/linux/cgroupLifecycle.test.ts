import { expect, test } from "bun:test";
import { fixture, launch, liveLeader, root, runtimeCgroup, spec } from "./cgroupOperationsFixture.ts";
import { linuxCgroupDirectory } from "./cgroupPaths.ts";

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
	const prepared = state.lifecycle().prepareLaunch({
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
	expect(() => state.lifecycle().prepareLaunch(spec)).toThrow(
		"Linux agent launch requires a delegated cgroup v2 subtree: the runtime has no cgroup v2 membership",
	);
});

test("a runtime cgroup without delegation refuses the launch", () => {
	const state = fixture();
	state.writable.delete(`${runtimeCgroup}/cgroup.procs`);
	expect(() => state.lifecycle().prepareLaunch(spec)).toThrow(
		`Linux agent launch requires a delegated cgroup v2 subtree: this user cannot create cgroups or move processes in ${runtimeCgroup}`,
	);
});

test("a kernel without cgroup.kill refuses the launch", () => {
	const state = fixture();
	state.operations.makeDirectory = (path) => state.directories.add(path);
	expect(() => state.lifecycle().prepareLaunch(spec)).toThrow("requires Linux 5.14 or later");
});

test("a stop of a launch kills its cgroup and removes it after the cgroup is empty", async () => {
	const state = fixture();
	const lifecycle = state.lifecycle();
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
	await state.lifecycle().stopProcessTree(77);
	expect(state.writes).toEqual([`${launch}/cgroup.kill=1`, `${launch}/cgroup.kill=1`]);
	expect(state.directories.has(launch)).toBe(false);
});

test("a stop of a session outside every launch cgroup fails at once", async () => {
	const state = fixture();
	state.makeCgroup(root);
	state.placeProcess(77, runtimeCgroup);
	state.setSession({ kind: "live", pids: [77] });
	await expect(state.lifecycle().stopProcessTree(77)).rejects.toThrow(
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
	await state.lifecycle().stopProcessTree(42);
	expect(state.writes).toEqual([]);
	expect(state.directories.has(other)).toBe(true);
});

test("a stop that cannot empty the cgroup stays unconfirmed and keeps the cgroup", async () => {
	const state = fixture();
	const lifecycle = state.lifecycle();
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
	const lifecycle = state.lifecycle();
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
	const lifecycle = state.lifecycle();
	lifecycle.prepareLaunch(spec).started(42);
	state.makeCgroup(launch);
	state.placeProcess(43, runtimeCgroup);
	state.setSession({ kind: "live", pids: [43] });
	await expect(lifecycle.stopProcessTree(42)).rejects.toThrow(
		"Process session 42 has live processes outside its attempt cgroup: 43",
	);
});
