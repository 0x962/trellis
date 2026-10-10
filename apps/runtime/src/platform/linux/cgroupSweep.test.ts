import { expect, test } from "bun:test";
import { adoptsRecoveredLeader } from "../adoptsRecoveredLeader.ts";
import type { LinuxLaunchSweep } from "./cgroupLifecycle.ts";
import { attempts, fixture, home, launch, root, runtimeCgroup } from "./cgroupOperationsFixture.ts";
import { homeTag } from "./cgroupPaths.ts";
import { createLinuxProcessInspector } from "./linuxProcessInspector.ts";

test("an adopted leader registers its launch cgroup for a later stop", async () => {
	const state = fixture();
	state.makeCgroup(root);
	state.makeCgroup(launch);
	state.files.set(`${launch}/cgroup.events`, "populated 1\nfrozen 0\n");
	state.placeProcess(42, launch);
	const lifecycle = state.lifecycle();
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
	const lifecycle = state.lifecycle();
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
	const swept = await state.lifecycle().sweep();
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
	const swept = await state.lifecycle().sweep();
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
	const lifecycle = state.lifecycle();
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
	const swept = await state.lifecycle().sweep();
	expect(swept).toEqual([{ type: "linux-launch-sweep", cgroup: orphan, pids: [77], outcome: "failed" }]);
	expect(state.directories.has(orphan)).toBe(true);
});

test("the sweep does nothing on a host without a cgroup v2 membership", async () => {
	const state = fixture();
	state.files.set("/proc/self/cgroup", "1:name=systemd:/user.slice\n");
	expect(await state.lifecycle().sweep()).toEqual([]);
});

test("a home tag is the first 16 hex digits of the SHA-256 of the resolved home", () => {
	expect(homeTag(home)).toMatch(/^[0-9a-f]{16}$/);
	expect(homeTag(`${home}/../runtime`)).toBe(homeTag(home));
	expect(homeTag("/home/runner/.trellis/other")).not.toBe(homeTag(home));
});

test("a launch cgroup of another runtime home survives the sweep", async () => {
	const state = fixture();
	const other = `${attempts}/${homeTag("/home/runner/.trellis/other")}/launch-other`;
	const orphan = `${root}/launch-orphan`;
	state.makeCgroup(root);
	state.makeCgroup(other);
	state.makeCgroup(orphan);
	state.files.set(`${other}/cgroup.procs`, "88\n");
	state.files.set(`${other}/cgroup.events`, "populated 1\nfrozen 0\n");
	const swept = await state.lifecycle().sweep();
	expect(swept.map((event) => event.cgroup)).toEqual([orphan]);
	expect(state.writes).toEqual([`${orphan}/cgroup.kill=1`]);
	expect(state.directories.has(other)).toBe(true);
});

// A zombie main thread with a live sibling thread makes the inspector answer
// unknown, though the agent still runs.
test("a recovered leader that the inspector answers unknown keeps its launch cgroup through the sweep", async () => {
	const state = fixture();
	state.makeCgroup(root);
	state.makeCgroup(launch);
	state.files.set(`${launch}/cgroup.procs`, "42\n");
	state.files.set(`${launch}/cgroup.events`, "populated 1\nfrozen 0\n");
	state.placeProcess(42, launch);
	const stat = (pid: number, status: string) =>
		`${pid} (agent) ${[status, 1, 42, 42, ...Array(15).fill(0), 250, 0, 0].join(" ")}`;
	const inspector = createLinuxProcessInspector({
		readFile(path) {
			if (path === "/proc/sys/kernel/random/boot_id") return "boot\n";
			if (path === "/proc/42/stat" || path === "/proc/42/task/42/stat") return stat(42, "Z");
			if (path === "/proc/42/task/43/stat") return stat(43, "S");
			throw Object.assign(new Error("missing"), { code: "ENOENT" });
		},
		readLink: () => "/usr/bin/agent",
		readDirectory: () => ["42", "43"],
		clockTicks: 100,
	});
	const leader = inspector.inspectProcess(42);
	expect(leader.kind).toBe("unknown");
	const lifecycle = state.lifecycle();
	if (adoptsRecoveredLeader(leader, "linux:boot:42:250")) lifecycle.adopt(42);
	expect(await lifecycle.sweep()).toEqual([]);
	expect(state.writes).toEqual([]);
	expect(state.directories.has(launch)).toBe(true);
});

test("a recovered leader that exited or that another process replaced keeps no launch", () => {
	const live = (identity: string) => ({
		kind: "live" as const,
		process: { pid: 42, parentPid: 1, groupId: 42, identity, startedAt: "2026-10-10T00:00:00.000Z" },
	});
	expect(adoptsRecoveredLeader({ kind: "missing" }, "linux:boot:42:250")).toBe(false);
	expect(adoptsRecoveredLeader(live("linux:boot:42:999"), "linux:boot:42:250")).toBe(false);
	expect(adoptsRecoveredLeader(live("linux:boot:42:250"), "linux:boot:42:250")).toBe(true);
	expect(adoptsRecoveredLeader({ kind: "unknown", error: "Process 42 has live thread 43" }, null)).toBe(true);
});
