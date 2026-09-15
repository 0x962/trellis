import { constants } from "node:os";
import type { RuntimeProcessMetadata } from "@trellis/runtime-protocol";
import { errno, load } from "koffi";

export type ProcessObservation =
	| { kind: "live"; process: RuntimeProcessMetadata }
	| { kind: "missing" }
	| { kind: "unknown"; error: string };

const library = load(null);
const pidInfo = library.func("int proc_pidinfo(int pid, int flavor, uint64_t arg, void *buffer, int buffersize)");
const pidPath = library.func("int proc_pidpath(int pid, void *buffer, uint32_t buffersize)");

// macOS sys/proc_info.h defines proc_bsdinfo as 136 bytes. Its start timestamp
// distinguishes two processes that receive the same PID at different times.
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
