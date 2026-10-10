import { expect, test } from "bun:test";
import { createLinuxProcessInspector, type LinuxProcessOperations } from "./linuxProcessInspector.ts";
import { linuxProcessIdentity, parseLinuxProcessStat } from "./procStat.ts";

const processStat = ({
	pid = 42,
	name = "agent worker",
	state = "S",
	parentPid = 1,
	groupId = 42,
	sessionId = 42,
	startTicks = 250n,
} = {}) =>
	`${pid} (${name}) ${[state, parentPid, groupId, sessionId, ...Array.from({ length: 15 }, () => 0), startTicks, 0, 0].join(" ")}`;

const notFound = () => Object.assign(new Error("not found"), { code: "ENOENT" });

function operations(overrides: Partial<LinuxProcessOperations> = {}): LinuxProcessOperations {
	return {
		readFile(path) {
			if (path === "/proc/sys/kernel/random/boot_id") return "boot-a\n";
			if (path === "/proc/stat") return "cpu 1 2 3\nbtime 1000\n";
			if (path === "/proc/42/stat" || path === "/proc/42/task/42/stat") return processStat();
			throw notFound();
		},
		readLink: () => "/usr/bin/agent",
		readDirectory: (path) => (path === "/proc/42/task" ? ["42"] : ["self", "42"]),
		clockTicks: 100,
		...overrides,
	};
}

const withFile = (path: string, value: () => string) =>
	operations({
		readFile: (requested) => (requested === path ? value() : operations().readFile(requested)),
	});

test("the stat parser accepts spaces and closing parentheses in a process name", () => {
	expect(parseLinuxProcessStat(processStat({ name: "agent ) (worker", startTicks: 987n }))).toEqual({
		pid: 42,
		state: "S",
		parentPid: 1,
		groupId: 42,
		sessionId: 42,
		startTicks: 987n,
	});
});

test("the stat parser refuses a stat without a complete process name", () => {
	expect(() => parseLinuxProcessStat("42 agent S 1 42 42")).toThrow("no complete process name");
});

test("a live process has the boot ID, the PID, and the start ticks as its identity", () => {
	expect(createLinuxProcessInspector(operations()).inspectProcess(42)).toEqual({
		kind: "live",
		process: {
			pid: 42,
			parentPid: 1,
			groupId: 42,
			identity: "linux:boot-a:42:250",
			startedAt: "1970-01-01T00:16:42.500Z",
			executable: "/usr/bin/agent",
		},
	});
});

test("the process identity does not read the executable link", () => {
	const inspector = createLinuxProcessInspector(
		operations({
			readLink() {
				throw Object.assign(new Error("denied"), { code: "EACCES" });
			},
		}),
	);
	expect(inspector.processIdentity(42)).toEqual({
		kind: "live",
		process: {
			pid: 42,
			parentPid: 1,
			groupId: 42,
			identity: "linux:boot-a:42:250",
			startedAt: "1970-01-01T00:16:42.500Z",
		},
	});
});

test("a reused PID has a different identity than the recorded process", () => {
	const recorded = createLinuxProcessInspector(operations()).processIdentity(42);
	const reused = createLinuxProcessInspector(withFile("/proc/42/stat", () => processStat({ startTicks: 900n })));
	const current = reused.processIdentity(42);
	expect(recorded.kind === "live" && current.kind === "live").toBe(true);
	if (recorded.kind !== "live" || current.kind !== "live") return;
	expect(current.process.identity).not.toBe(recorded.process.identity);
	expect(current.process.identity).toBe(linuxProcessIdentity("boot-a", 42, 900n));
});

test("a host reboot changes the identity of a process with the same PID and start ticks", () => {
	const before = createLinuxProcessInspector(operations()).processIdentity(42);
	const after = createLinuxProcessInspector(
		withFile("/proc/sys/kernel/random/boot_id", () => "boot-b\n"),
	).processIdentity(42);
	if (before.kind !== "live" || after.kind !== "live") throw new Error("Both observations must be live");
	expect(after.process.identity).toBe("linux:boot-b:42:250");
	expect(after.process.identity).not.toBe(before.process.identity);
});

test("a PID reuse during inspection produces an unknown observation", () => {
	let reads = 0;
	const inspector = createLinuxProcessInspector(
		withFile("/proc/42/stat", () => processStat({ startTicks: reads++ === 0 ? 250n : 251n })),
	);
	expect(inspector.inspectProcess(42)).toEqual({ kind: "unknown", error: "Process 42 changed during inspection" });
});

test("a reboot during inspection produces an unknown observation", () => {
	let reads = 0;
	const inspector = createLinuxProcessInspector(
		withFile("/proc/sys/kernel/random/boot_id", () => (reads++ === 0 ? "boot-a" : "boot-b")),
	);
	expect(inspector.inspectProcess(42)).toEqual({ kind: "unknown", error: "Process 42 changed during inspection" });
});

test("an absent proc entry produces a missing observation", () => {
	const inspector = createLinuxProcessInspector(
		withFile("/proc/42/stat", () => {
			throw notFound();
		}),
	);
	expect(inspector.inspectProcess(42)).toEqual({ kind: "missing" });
	expect(inspector.sessionOf(42)).toBe(-1);
});

test("a proc permission error produces an unknown observation", () => {
	const inspector = createLinuxProcessInspector(
		withFile("/proc/42/stat", () => {
			throw Object.assign(new Error("permission denied"), { code: "EPERM" });
		}),
	);
	expect(inspector.inspectProcess(42)).toEqual({
		kind: "unknown",
		error: "Cannot read /proc/42/stat: EPERM: permission denied",
	});
});

for (const state of ["Z", "X", "x"]) {
	test(`a ${state} process with only terminal threads is missing`, () => {
		const inspector = createLinuxProcessInspector(
			operations({
				readFile: (path) =>
					path === "/proc/42/stat" || path === "/proc/42/task/42/stat"
						? processStat({ state })
						: operations().readFile(path),
			}),
		);
		expect(inspector.inspectProcess(42)).toEqual({ kind: "missing" });
		expect(inspector.inspectProcessSession(42)).toEqual({ kind: "empty" });
	});
}

test("a zombie main thread with a live sibling thread is unknown", () => {
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
	expect(inspector.inspectProcessSession(42)).toEqual({ kind: "unknown", error: "Process 42 has live thread 43" });
});

test("a zombie that its parent reaps during inspection is missing", () => {
	const inspector = createLinuxProcessInspector(
		operations({
			readDirectory(path) {
				if (path === "/proc/42/task") throw notFound();
				return ["42"];
			},
			readFile: (path) => (path === "/proc/42/stat" ? processStat({ state: "Z" }) : operations().readFile(path)),
		}),
	);
	expect(inspector.inspectProcess(42)).toEqual({ kind: "missing" });
});

test("session inspection lists live members and skips vanished entries", () => {
	const inspector = createLinuxProcessInspector(
		operations({
			readDirectory: () => ["self", "41", "42", "43", "44"],
			readFile(path) {
				if (path === "/proc/41/stat") return processStat({ pid: 41, sessionId: 41 });
				if (path === "/proc/43/stat") throw notFound();
				if (path === "/proc/44/stat") return processStat({ pid: 44, name: "a (b) c", sessionId: 42 });
				return operations().readFile(path);
			},
		}),
	);
	expect(inspector.inspectProcessSession(42)).toEqual({ kind: "live", pids: [42, 44] });
	expect(inspector.sessionOf(41)).toBe(41);
});

test("a reboot during session inspection produces an unknown observation", () => {
	let reads = 0;
	const inspector = createLinuxProcessInspector(
		withFile("/proc/sys/kernel/random/boot_id", () => (reads++ === 0 ? "boot-a" : "boot-b")),
	);
	expect(inspector.inspectProcessSession(42)).toEqual({
		kind: "unknown",
		error: "The host rebooted during process session inspection",
	});
});
