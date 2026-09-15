import { constants } from "node:os";
import { errno, load } from "koffi";

const library = load(null);
const listPids = library.func("int proc_listpids(uint32_t type, uint32_t typeinfo, void *buffer, int buffersize)");
const sessionOf = library.func("int getsid(int pid)");
const pidInfo = library.func("int proc_pidinfo(int pid, int flavor, uint64_t arg, void *buffer, int buffersize)");

export type ProcessSessionObservation =
	| { kind: "empty" }
	| { kind: "live"; pids: number[] }
	| { kind: "unknown"; error: string };

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
		const info = Buffer.alloc(136);
		const found = pidInfo(pid, 3, 0, info, info.length);
		if (found <= 0 && errno() === constants.errno.ESRCH) continue;
		if (found !== info.length)
			return { kind: "unknown", error: `Cannot inspect child process ${pid} in session ${sessionId}` };
		if (info.readUInt32LE(4) !== 5) members.push(pid);
	}
	return members.length > 0 ? { kind: "live", pids: members } : { kind: "empty" };
}
