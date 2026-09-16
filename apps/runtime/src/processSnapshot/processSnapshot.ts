import { constants } from "node:os";
import type { SessionProcess } from "../terminateSession.ts";

type ProcessOperations = {
	listPids: (type: number, typeinfo: number, buffer: Buffer | null, size: number) => number;
	pidInfo: (pid: number, flavor: number, arg: number, buffer: Buffer, size: number) => number;
	errno: () => number;
};

export function processSnapshot(operations: ProcessOperations): SessionProcess[] {
	const size = operations.listPids(1, 0, null, 0);
	if (size <= 0) throw new Error(`proc_listpids size query failed with errno ${operations.errno()}`);
	const pids = Buffer.alloc(size * 2);
	const count = operations.listPids(1, 0, pids, pids.length);
	if (count <= 0) throw new Error(`proc_listpids failed with errno ${operations.errno()}`);
	if (count >= pids.length || count % 4 !== 0)
		throw new Error(`proc_listpids returned an incomplete process list: ${count} bytes`);
	const processes: SessionProcess[] = [];
	// macOS permits proc_bsdshortinfo across users; the full proc_bsdinfo record requires the same user.
	// sys/proc_info.h defines this 64-byte record and its field offsets.
	// A zombie has status 5 (SZOMB) and cannot execute code or receive a signal.
	const info = Buffer.alloc(64);
	for (let offset = 0; offset < count; offset += 4) {
		const pid = pids.readInt32LE(offset);
		if (pid <= 0) continue;
		const found = operations.pidInfo(pid, 13, 1, info, info.length);
		if (found <= 0) {
			const failure = operations.errno();
			if (failure === constants.errno.ESRCH) continue;
			throw new Error(`proc_pidinfo(${pid}) failed with errno ${failure}`);
		}
		if (found !== info.length) throw new Error(`proc_pidinfo(${pid}) returned ${found} bytes`);
		processes.push({
			pid,
			parent: info.readUInt32LE(4),
			group: info.readUInt32LE(8),
			state: info.readUInt32LE(12) === 5 ? "Z" : "live",
		});
	}
	return processes;
}
