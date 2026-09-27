import { expect, test } from "bun:test";
import {
	createLinuxProcessInspector,
	linuxProcessIdentity,
	parseLinuxProcessStat,
	type LinuxProcessOperations,
} from "./linux.ts";

const processStat = ({
	pid = 42,
	name = "agent worker",
	state = "S",
	parentPid = 1,
	groupId = 42,
	sessionId = 42,
	startTicks = 250n,
} = {}) =>
	`${pid} (${name}) ${[
		state,
		parentPid,
		groupId,
		sessionId,
		...Array.from({ length: 15 }, () => 0),
		startTicks,
	].join(" ")}`;

const permissionError = () => Object.assign(new Error("permission denied"), { code: "EPERM" });

function operations(overrides: Partial<LinuxProcessOperations> = {}): LinuxProcessOperations {
	return {
		readFile(path) {
			if (path === "/proc/sys/kernel/random/boot_id") return "boot-a\n";
			if (path === "/proc/stat") return "cpu 1 2 3\nbtime 1000\n";
			if (path === "/proc/42/stat") return processStat();
			if (path === "/proc/42/task/42/stat") return processStat();
			throw Object.assign(new Error("not found"), { code: "ENOENT" });
		},
		readLink: () => "/usr/bin/agent",
		readDirectory: (path) => (path === "/proc/42/task" ? ["42"] : ["self", "42"]),
		clockTicks: 100,
		...overrides,
	};
}

test("the Linux stat parser accepts spaces and closing parentheses in a process name", () => {
	expect(parseLinuxProcessStat(processStat({ name: "agent ) worker", startTicks: 987n }))).toEqual({
		pid: 42,
		state: "S",
		parentPid: 1,
		groupId: 42,
		sessionId: 42,
		startTicks: 987n,
	});
});

test("the public process inspector loads its current platform module", async () => {
	const current = await import("../../inspectProcess.ts");
	expect(typeof current.inspectProcess).toBe("function");
});

test("a live Linux process uses the boot ID, PID, and start ticks as its identity", () => {
	const inspector = createLinuxProcessInspector(operations());
	expect(inspector.inspectProcess(42)).toEqual({
		kind: "live",
		process: {
			pid: 42,
			parentPid: 1,
			groupId: 42,
			identity: linuxProcessIdentity({ bootId: "boot-a", pid: 42, startTicks: 250n }),
			startedAt: "1970-01-01T00:16:42.500Z",
			executable: "/usr/bin/agent",
		},
	});
});

test("a reused PID produces an unknown observation", () => {
	let reads = 0;
	const inspector = createLinuxProcessInspector(
		operations({
			readFile(path) {
				if (path === "/proc/42/stat") return processStat({ startTicks: reads++ === 0 ? 250n : 251n });
				return operations().readFile(path);
			},
		}),
	);
	expect(inspector.inspectProcess(42)).toEqual({ kind: "unknown", error: "Process 42 changed during inspection" });
});

test("a reboot during inspection produces an unknown observation", () => {
	let reads = 0;
	const inspector = createLinuxProcessInspector(
		operations({
			readFile(path) {
				if (path === "/proc/sys/kernel/random/boot_id") return reads++ === 0 ? "boot-a" : "boot-b";
				return operations().readFile(path);
			},
		}),
	);
	expect(inspector.inspectProcess(42)).toEqual({ kind: "unknown", error: "Process 42 changed during inspection" });
});

test("an absent proc entry produces a missing observation", () => {
	const inspector = createLinuxProcessInspector(
		operations({
			readFile(path) {
				if (path === "/proc/42/stat") throw Object.assign(new Error("not found"), { code: "ENOENT" });
				return operations().readFile(path);
			},
		}),
	);
	expect(inspector.inspectProcess(42)).toEqual({ kind: "missing" });
});

test("a proc permission error produces an unknown observation", () => {
	const inspector = createLinuxProcessInspector(
		operations({
			readFile(path) {
				if (path === "/proc/42/stat") throw permissionError();
				return operations().readFile(path);
			},
		}),
	);
	expect(inspector.inspectProcess(42)).toEqual({
		kind: "unknown",
		error: "Cannot read /proc/42/stat: EPERM: permission denied",
	});
});

for (const state of ["X", "x"]) {
	test(`a ${state} process is absent on the first process read`, () => {
		const inspector = createLinuxProcessInspector(
			operations({
				readFile(path) {
					if (path === "/proc/42/stat" || path === "/proc/42/task/42/stat") return processStat({ state });
					return operations().readFile(path);
				},
			}),
		);
		expect(inspector.inspectProcess(42)).toEqual({ kind: "missing" });
	});

	test(`a ${state} process is absent on the second process read`, () => {
		let reads = 0;
		const inspector = createLinuxProcessInspector(
			operations({
				readFile(path) {
					if (path === "/proc/42/stat") return processStat({ state: reads++ === 0 ? "S" : state });
					if (path === "/proc/42/task/42/stat") return processStat({ state });
					return operations().readFile(path);
				},
			}),
		);
		expect(inspector.inspectProcess(42)).toEqual({ kind: "missing" });
	});

	test(`a ${state} process is absent from the session scan`, () => {
		const inspector = createLinuxProcessInspector(
			operations({
				readFile(path) {
					if (path === "/proc/42/stat" || path === "/proc/42/task/42/stat") return processStat({ state });
					return operations().readFile(path);
				},
			}),
		);
		expect(inspector.inspectProcessSession(42)).toEqual({ kind: "empty" });
	});
}

test("a terminal main thread with a live sibling produces an unknown process observation", () => {
	const inspector = createLinuxProcessInspector(
		operations({
			readDirectory: (path) => (path === "/proc/42/task" ? ["42", "43"] : ["42"]),
			readFile(path) {
				if (path === "/proc/42/stat" || path === "/proc/42/task/42/stat") return processStat({ state: "Z" });
				if (path === "/proc/42/task/43/stat") return processStat({ pid: 43, state: "S" });
				return operations().readFile(path);
			},
		}),
	);
	expect(inspector.inspectProcess(42)).toEqual({ kind: "unknown", error: "Process 42 has live thread 43" });
});

test("a terminal main thread with a live sibling produces an unknown session observation", () => {
	const inspector = createLinuxProcessInspector(
		operations({
			readDirectory: (path) => (path === "/proc/42/task" ? ["42", "43"] : ["42"]),
			readFile(path) {
				if (path === "/proc/42/stat" || path === "/proc/42/task/42/stat") return processStat({ state: "Z" });
				if (path === "/proc/42/task/43/stat") return processStat({ pid: 43, state: "S" });
				return operations().readFile(path);
			},
		}),
	);
	expect(inspector.inspectProcessSession(42)).toEqual({
		kind: "unknown",
		error: "Process 42 has live thread 43",
	});
});

test("a terminal main thread stays unknown when the task directory is unavailable", () => {
	const inspector = createLinuxProcessInspector(
		operations({
			readDirectory(path) {
				if (path === "/proc/42/task") throw Object.assign(new Error("not found"), { code: "ENOENT" });
				return ["42"];
			},
			readFile(path) {
				if (path === "/proc/42/stat") return processStat({ state: "Z" });
				return operations().readFile(path);
			},
		}),
	);
	expect(inspector.inspectProcess(42)).toEqual({
		kind: "unknown",
		error: "Cannot confirm that process 42 exited",
	});
});

test("an unavailable exe link stays unknown while the process has a live thread", () => {
	const inspector = createLinuxProcessInspector(
		operations({
			readLink() {
				throw Object.assign(new Error("not found"), { code: "ENOENT" });
			},
		}),
	);
	expect(inspector.inspectProcess(42)).toEqual({ kind: "unknown", error: "Process 42 has live thread 42" });
});

test("Linux session inspection lists live members and skips vanished entries", () => {
	const inspector = createLinuxProcessInspector(
		operations({
			readDirectory: () => ["self", "41", "42", "43"],
			readFile(path) {
				if (path === "/proc/41/stat") return processStat({ pid: 41, sessionId: 41 });
				if (path === "/proc/42/stat") return processStat({ pid: 42, sessionId: 42 });
				if (path === "/proc/43/stat") throw Object.assign(new Error("not found"), { code: "ENOENT" });
				return operations().readFile(path);
			},
		}),
	);
	expect(inspector.inspectProcessSession(42)).toEqual({ kind: "live", pids: [42] });
});
