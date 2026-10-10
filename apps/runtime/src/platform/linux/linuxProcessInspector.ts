import type {
	ProcessIdentity,
	ProcessIdentityObservation,
	ProcessObservation,
	ProcessSessionObservation,
} from "../runtimePlatform.ts";
import { type LinuxProcessStat, linuxProcessIdentity, parseLinuxProcessStat } from "./procStat.ts";

export type LinuxProcessOperations = {
	readFile: (path: string) => string;
	readLink: (path: string) => string;
	readDirectory: (path: string) => string[];
	clockTicks: number;
};

export type LinuxProcessInspector = {
	inspectProcess: (pid: number) => ProcessObservation;
	processIdentity: (pid: number) => ProcessIdentityObservation;
	inspectProcessSession: (sessionId: number) => ProcessSessionObservation;
	sessionOf: (pid: number) => number;
};

const bootIdPath = "/proc/sys/kernel/random/boot_id";
const systemStatPath = "/proc/stat";
// A zombie (Z) or dead (X, x) task cannot execute code or receive a signal.
const terminalStates = new Set(["Z", "X", "x"]);

type Value<T> = { kind: "value"; value: T };
type Unknown = { kind: "unknown"; error: string };
type Missing = { kind: "missing" };

const errorText = (error: unknown) =>
	error instanceof Error ? `${(error as NodeJS.ErrnoException).code ?? error.name}: ${error.message}` : String(error);

const readSystem = <T>(operation: () => T, label: string): Value<T> | Unknown => {
	try {
		return { kind: "value", value: operation() };
	} catch (error) {
		return { kind: "unknown", error: `${label}: ${errorText(error)}` };
	}
};

// A /proc/<pid> entry disappears when its process is reaped. ESRCH comes from
// a read that starts while the entry exists and ends after the process exits.
const readEntry = <T>(operation: () => T, label: string): Value<T> | Missing | Unknown => {
	try {
		return { kind: "value", value: operation() };
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		if (code === "ENOENT" || code === "ESRCH") return { kind: "missing" };
		return { kind: "unknown", error: `${label}: ${errorText(error)}` };
	}
};

const bootTime = (value: string) => {
	const match = /^btime\s+(\d+)$/m.exec(value);
	if (match === null) throw new Error("The Linux system stat has no boot time");
	return Number(match[1]);
};

export function createLinuxProcessInspector(operations: LinuxProcessOperations): LinuxProcessInspector {
	const readBootId = () => readSystem(() => operations.readFile(bootIdPath).trim(), `Cannot read ${bootIdPath}`);

	const readStat = (path: string, expectedPid: number): Value<LinuxProcessStat> | Missing | Unknown => {
		const text = readEntry(() => operations.readFile(path), `Cannot read ${path}`);
		if (text.kind !== "value") return text;
		let stat: LinuxProcessStat;
		try {
			stat = parseLinuxProcessStat(text.value);
		} catch (error) {
			return { kind: "unknown", error: `Cannot parse ${path}: ${errorText(error)}` };
		}
		if (stat.pid !== expectedPid) return { kind: "unknown", error: `${path} describes process ${stat.pid}` };
		return { kind: "value", value: stat };
	};

	// The main thread of a process can be a zombie while another thread still
	// runs. The process exits only when every thread is terminal. A task
	// directory that disappears belongs to a process that its parent reaped.
	const confirmAbsent = (pid: number): Missing | Unknown => {
		const taskPath = `/proc/${pid}/task`;
		const entries = readEntry(() => operations.readDirectory(taskPath), `Cannot read ${taskPath}`);
		if (entries.kind !== "value") return entries;
		for (const entry of entries.value) {
			if (!/^\d+$/.test(entry)) continue;
			const thread = readStat(`${taskPath}/${entry}/stat`, Number(entry));
			if (thread.kind === "missing") continue;
			if (thread.kind === "unknown") return thread;
			if (!terminalStates.has(thread.value.state))
				return { kind: "unknown", error: `Process ${pid} has live thread ${entry}` };
		}
		return { kind: "missing" };
	};

	// Two reads of the boot ID and the start time detect a reboot or a reused
	// PID between the first read and the last read.
	const observe = (
		pid: number,
		withExecutable: boolean,
	): { kind: "live"; process: ProcessIdentity; executable: string } | Missing | Unknown => {
		const firstBoot = readBootId();
		if (firstBoot.kind === "unknown") return firstBoot;
		const statPath = `/proc/${pid}/stat`;
		const first = readStat(statPath, pid);
		if (first.kind !== "value") return first;
		if (terminalStates.has(first.value.state)) return confirmAbsent(pid);
		let executable = "";
		if (withExecutable) {
			const executablePath = `/proc/${pid}/exe`;
			const link = readEntry(() => operations.readLink(executablePath), `Cannot read ${executablePath}`);
			if (link.kind === "missing") return confirmAbsent(pid);
			if (link.kind === "unknown") return link;
			executable = link.value;
		}
		const systemStat = readSystem(() => bootTime(operations.readFile(systemStatPath)), `Cannot read ${systemStatPath}`);
		if (systemStat.kind === "unknown") return systemStat;
		const secondBoot = readBootId();
		if (secondBoot.kind === "unknown") return secondBoot;
		const second = readStat(statPath, pid);
		if (second.kind !== "value") return second;
		if (terminalStates.has(second.value.state)) return confirmAbsent(pid);
		const identity = linuxProcessIdentity(firstBoot.value, pid, first.value.startTicks);
		if (identity !== linuxProcessIdentity(secondBoot.value, pid, second.value.startTicks))
			return { kind: "unknown", error: `Process ${pid} changed during inspection` };
		const startedAt = new Date(
			(systemStat.value + Number(first.value.startTicks) / operations.clockTicks) * 1000,
		).toISOString();
		return {
			kind: "live",
			process: { pid, parentPid: first.value.parentPid, groupId: first.value.groupId, identity, startedAt },
			executable,
		};
	};

	return {
		inspectProcess(pid) {
			const observed = observe(pid, true);
			if (observed.kind !== "live") return observed;
			return { kind: "live", process: { ...observed.process, executable: observed.executable } };
		},
		processIdentity(pid) {
			const observed = observe(pid, false);
			return observed.kind === "live" ? { kind: "live", process: observed.process } : observed;
		},
		inspectProcessSession(sessionId) {
			const firstBoot = readBootId();
			if (firstBoot.kind === "unknown") return firstBoot;
			const entries = readSystem(() => operations.readDirectory("/proc"), "Cannot read /proc");
			if (entries.kind === "unknown") return entries;
			const members: number[] = [];
			for (const entry of entries.value) {
				if (!/^\d+$/.test(entry)) continue;
				const pid = Number(entry);
				const stat = readStat(`/proc/${pid}/stat`, pid);
				if (stat.kind === "missing") continue;
				if (stat.kind === "unknown") return stat;
				if (stat.value.sessionId !== sessionId) continue;
				if (terminalStates.has(stat.value.state)) {
					const absence = confirmAbsent(pid);
					if (absence.kind === "unknown") return absence;
					continue;
				}
				members.push(pid);
			}
			const secondBoot = readBootId();
			if (secondBoot.kind === "unknown") return secondBoot;
			if (firstBoot.value !== secondBoot.value)
				return { kind: "unknown", error: "The host rebooted during process session inspection" };
			return members.length > 0 ? { kind: "live", pids: members } : { kind: "empty" };
		},
		sessionOf(pid) {
			const stat = readStat(`/proc/${pid}/stat`, pid);
			if (stat.kind === "missing") return -1;
			if (stat.kind === "unknown") throw new Error(stat.error);
			return stat.value.sessionId;
		},
	};
}
