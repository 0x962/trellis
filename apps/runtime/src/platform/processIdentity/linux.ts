import type { ProcessIdentityInspector } from "./types.ts";

const bootIdPath = "/proc/sys/kernel/random/boot_id";
const systemStatPath = "/proc/stat";

export type LinuxProcessIdentity = {
	bootId: string;
	pid: number;
	startTicks: bigint;
};

export type LinuxProcessStat = {
	pid: number;
	state: string;
	parentPid: number;
	groupId: number;
	sessionId: number;
	startTicks: bigint;
};

export type LinuxProcessOperations = {
	readFile: (path: string) => string;
	readLink: (path: string) => string;
	readDirectory: (path: string) => string[];
	clockTicks: number;
};

type Value<T> = { kind: "value"; value: T };
type Unknown = { kind: "unknown"; error: string };
type ProcessRead<T> = Value<T> | { kind: "missing" } | Unknown;

export const linuxProcessIdentity = ({ bootId, pid, startTicks }: LinuxProcessIdentity): string =>
	`linux:${bootId}:${pid}:${startTicks}`;

export function parseLinuxProcessStat(value: string): LinuxProcessStat {
	const nameStart = value.indexOf("(");
	const nameEnd = value.lastIndexOf(")");
	if (nameStart < 1 || nameEnd <= nameStart) throw new Error("The Linux process stat has no complete process name");
	const pid = Number(value.slice(0, nameStart).trim());
	const fields = value.slice(nameEnd + 1).trim().split(/\s+/);
	if (!Number.isSafeInteger(pid) || pid <= 0 || fields.length < 20)
		throw new Error("The Linux process stat has invalid fields");
	const parentPid = Number(fields[1]);
	const groupId = Number(fields[2]);
	const sessionId = Number(fields[3]);
	const startTicks = BigInt(fields[19]!);
	if (![parentPid, groupId, sessionId].every(Number.isSafeInteger))
		throw new Error("The Linux process stat has invalid process identifiers");
	return { pid, state: fields[0]!, parentPid, groupId, sessionId, startTicks };
}

const errorText = (error: unknown): string =>
	error instanceof Error ? `${(error as NodeJS.ErrnoException).code ?? error.name}: ${error.message}` : String(error);

const readSystem = <T>(operation: () => T, label: string): Value<T> | Unknown => {
	try {
		return { kind: "value", value: operation() };
	} catch (error) {
		return { kind: "unknown", error: `${label}: ${errorText(error)}` };
	}
};

const readProcessEntry = <T>(operation: () => T, label: string): ProcessRead<T> => {
	try {
		return { kind: "value", value: operation() };
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		if (code === "ENOENT" || code === "ESRCH") return { kind: "missing" };
		return { kind: "unknown", error: `${label}: ${errorText(error)}` };
	}
};

const parsedStat = (value: string, path: string): Value<LinuxProcessStat> | Unknown => {
	try {
		return { kind: "value", value: parseLinuxProcessStat(value) };
	} catch (error) {
		return { kind: "unknown", error: `Cannot parse ${path}: ${errorText(error)}` };
	}
};

const bootTime = (value: string): number => {
	const match = /^btime\s+(\d+)$/m.exec(value);
	if (match === null) throw new Error("The Linux system stat has no boot time");
	return Number(match[1]);
};

export function createLinuxProcessInspector(operations: LinuxProcessOperations): ProcessIdentityInspector {
	return {
		inspectProcess(pid) {
			const firstBoot = readSystem(() => operations.readFile(bootIdPath).trim(), `Cannot read ${bootIdPath}`);
			if (firstBoot.kind === "unknown") return firstBoot;
			const statPath = `/proc/${pid}/stat`;
			const firstStatText = readProcessEntry(() => operations.readFile(statPath), `Cannot read ${statPath}`);
			if (firstStatText.kind !== "value") return firstStatText;
			const firstStat = parsedStat(firstStatText.value, statPath);
			if (firstStat.kind === "unknown") return firstStat;
			if (firstStat.value.pid !== pid)
				return { kind: "unknown", error: `${statPath} describes process ${firstStat.value.pid}` };
			if (firstStat.value.state === "Z") return { kind: "missing" };
			const executablePath = `/proc/${pid}/exe`;
			const executable = readProcessEntry(() => operations.readLink(executablePath), `Cannot read ${executablePath}`);
			if (executable.kind !== "value") return executable;
			const systemStat = readSystem(() => operations.readFile(systemStatPath), `Cannot read ${systemStatPath}`);
			if (systemStat.kind === "unknown") return systemStat;
			let startedAt: string;
			try {
				startedAt = new Date(
					(bootTime(systemStat.value) + Number(firstStat.value.startTicks) / operations.clockTicks) * 1000,
				).toISOString();
			} catch (error) {
				return { kind: "unknown", error: `Cannot parse ${systemStatPath}: ${errorText(error)}` };
			}
			const secondBoot = readSystem(() => operations.readFile(bootIdPath).trim(), `Cannot read ${bootIdPath}`);
			if (secondBoot.kind === "unknown") return secondBoot;
			const secondStatText = readProcessEntry(() => operations.readFile(statPath), `Cannot read ${statPath}`);
			if (secondStatText.kind !== "value") return secondStatText;
			const secondStat = parsedStat(secondStatText.value, statPath);
			if (secondStat.kind === "unknown") return secondStat;
			if (secondStat.value.pid !== pid)
				return { kind: "unknown", error: `${statPath} describes process ${secondStat.value.pid}` };
			if (secondStat.value.state === "Z") return { kind: "missing" };
			const firstIdentity = linuxProcessIdentity({
				bootId: firstBoot.value,
				pid,
				startTicks: firstStat.value.startTicks,
			});
			const secondIdentity = linuxProcessIdentity({
				bootId: secondBoot.value,
				pid,
				startTicks: secondStat.value.startTicks,
			});
			if (firstIdentity !== secondIdentity)
				return { kind: "unknown", error: `Process ${pid} changed during inspection` };
			return {
				kind: "live",
				process: {
					pid,
					parentPid: firstStat.value.parentPid,
					groupId: firstStat.value.groupId,
					identity: firstIdentity,
					startedAt,
					executable: executable.value,
				},
			};
		},
		inspectProcessSession(sessionId) {
			const firstBoot = readSystem(() => operations.readFile(bootIdPath).trim(), `Cannot read ${bootIdPath}`);
			if (firstBoot.kind === "unknown") return firstBoot;
			const entries = readSystem(() => operations.readDirectory("/proc"), "Cannot read /proc");
			if (entries.kind === "unknown") return entries;
			const members: number[] = [];
			for (const entry of entries.value) {
				if (!/^\d+$/.test(entry)) continue;
				const pid = Number(entry);
				const statPath = `/proc/${pid}/stat`;
				const statText = readProcessEntry(() => operations.readFile(statPath), `Cannot read ${statPath}`);
				if (statText.kind === "missing") continue;
				if (statText.kind === "unknown") return statText;
				const stat = parsedStat(statText.value, statPath);
				if (stat.kind === "unknown") return stat;
				if (stat.value.pid !== pid) return { kind: "unknown", error: `${statPath} describes process ${stat.value.pid}` };
				if (stat.value.sessionId === sessionId && stat.value.state !== "Z") members.push(pid);
			}
			const secondBoot = readSystem(() => operations.readFile(bootIdPath).trim(), `Cannot read ${bootIdPath}`);
			if (secondBoot.kind === "unknown") return secondBoot;
			if (firstBoot.value !== secondBoot.value)
				return { kind: "unknown", error: "The host rebooted during process session inspection" };
			return members.length > 0 ? { kind: "live", pids: members } : { kind: "empty" };
		},
	};
}
