import { constants } from "node:os";
import { errno, load } from "koffi";

const library = load(null);
const listPids = library.func("int proc_listpids(uint32_t type, uint32_t typeinfo, void *buffer, int buffersize)");
const sessionOf = library.func("int getsid(int pid)");
const pidInfo = library.func("int proc_pidinfo(int pid, int flavor, uint64_t arg, void *buffer, int buffersize)");

export function inspectProcessSession(sessionId: number): string | null {
	const size = listPids(1, 0, null, 0);
	if (size <= 0) return `Cannot list process session ${sessionId}: errno ${errno()}`;
	const pids = Buffer.alloc(size * 2);
	const count = listPids(1, 0, pids, pids.length);
	if (count <= 0 || count >= pids.length) return `Cannot confirm all members of process session ${sessionId}`;
	for (let offset = 0; offset < count; offset += 4) {
		const pid = pids.readInt32LE(offset);
		if (pid <= 0) continue;
		const session = sessionOf(pid);
		if (session === -1 && errno() !== constants.errno.ESRCH)
			return `Cannot inspect process ${pid}: getsid failed with errno ${errno()}`;
		if (session !== sessionId) continue;
		const info = Buffer.alloc(136);
		const found = pidInfo(pid, 3, 0, info, info.length);
		if (found <= 0 && errno() === constants.errno.ESRCH) continue;
		if (found !== info.length) return `Cannot inspect child process ${pid} in session ${sessionId}`;
		if (info.readUInt32LE(4) !== 5) return `Process session ${sessionId} still has a live child process ${pid}`;
	}
	return null;
}
