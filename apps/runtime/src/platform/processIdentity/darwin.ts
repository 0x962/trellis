import { constants } from "node:os";
import { errno, load } from "koffi";
import type { ProcessObservation, ProcessSessionObservation } from "./types.ts";

const library = load(null);
const listPids = library.func("int proc_listpids(uint32_t type, uint32_t typeinfo, void *buffer, int buffersize)");
const sessionOf = library.func("int getsid(int pid)");
const pidInfo = library.func("int proc_pidinfo(int pid, int flavor, uint64_t arg, void *buffer, int buffersize)");
const pidPath = library.func("int proc_pidpath(int pid, void *buffer, uint32_t buffersize)");

// sys/proc_info.h defines proc_bsdinfo as 136 bytes. The start timestamp identifies a reused PID.
const infoSize = 136;
const identity = (pid: number, info: Buffer) => `${pid}:${info.readBigUInt64LE(120)}:${info.readBigUInt64LE(128)}`;
const failed = (operation: string): ProcessObservation => {
	const failure = errno();
	return failure === constants.errno.ESRCH
		? { kind: "missing" }
		: { kind: "unknown", error: `${operation} failed with errno ${failure}` };
};

export function inspectProcess(pid: number): ProcessObservation {
	const info = Buffer.alloc(infoSize);
	const count = pidInfo(pid, 3, 0, info, info.length);
	if (count <= 0) return failed(`proc_pidinfo(${pid})`);
	if (count !== infoSize) return { kind: "unknown", error: `proc_pidinfo(${pid}) returned ${count} bytes` };
	if (info.readUInt32LE(4) === 5) return { kind: "missing" };
	const path = Buffer.alloc(4096);
	const pathCount = pidPath(pid, path, path.length);
	if (pathCount <= 0) return failed(`proc_pidpath(${pid})`);
	const verified = Buffer.alloc(infoSize);
	if (pidInfo(pid, 3, 0, verified, verified.length) !== infoSize) return failed(`proc_pidinfo(${pid})`);
	if (identity(pid, info) !== identity(pid, verified))
		return { kind: "unknown", error: `Process ${pid} changed during inspection` };
	return {
		kind: "live",
		process: {
			pid,
			parentPid: info.readUInt32LE(16),
			groupId: info.readUInt32LE(100),
			identity: identity(pid, info),
			startedAt: new Date(
				Number(info.readBigUInt64LE(120)) * 1000 + Number(info.readBigUInt64LE(128)) / 1000,
			).toISOString(),
			executable: path.subarray(0, pathCount).toString().replace(/\0.*$/, ""),
		},
	};
}

export function inspectProcessSession(sessionId: number): ProcessSessionObservation {
	const size = listPids(1, 0, null, 0);
	if (size <= 0) return { kind: "unknown", error: `Cannot list process session ${sessionId}: errno ${errno()}` };
	const pids = Buffer.alloc(size * 2);
	const count = listPids(1, 0, pids, pids.length);
	if (count <= 0 || count >= pids.length)
		return { kind: "unknown", error: `Cannot confirm all members of process session ${sessionId}` };
	const members: number[] = [];
	for (let offset = 0; offset < count; offset += 4) {
		const pid = pids.readInt32LE(offset);
		if (pid <= 0) continue;
		const session = sessionOf(pid);
		if (session === -1 && errno() !== constants.errno.ESRCH)
			return { kind: "unknown", error: `Cannot inspect process ${pid}: getsid failed with errno ${errno()}` };
		if (session !== sessionId) continue;
		const info = Buffer.alloc(infoSize);
		const found = pidInfo(pid, 3, 0, info, info.length);
		if (found <= 0 && errno() === constants.errno.ESRCH) continue;
		if (found !== info.length)
			return { kind: "unknown", error: `Cannot inspect child process ${pid} in session ${sessionId}` };
		if (info.readUInt32LE(4) !== 5) members.push(pid);
	}
	return members.length > 0 ? { kind: "live", pids: members } : { kind: "empty" };
}
