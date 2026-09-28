import { errno, load } from "koffi";
import { inspectProcess } from "../inspectProcess.ts";
import { processEnvironmentReader } from "./processEnvironment.ts";

const library = load(null);
const listPids = library.func("int proc_listpids(uint32_t type, uint32_t typeinfo, void *buffer, int buffersize)");

export function attemptProcesses(home: string, id: string) {
	const uid = process.getuid!();
	const bytes = listPids(4, uid, null, 0);
	if (bytes <= 0) throw new Error(`Cannot list agent processes: errno ${errno()}`);
	const pids = Buffer.alloc(bytes * 2);
	const count = listPids(4, uid, pids, pids.length);
	if (count <= 0 || count >= pids.length || count % 4 !== 0) throw new Error("The agent process list is incomplete");
	const environment = processEnvironmentReader();
	const matches = [];
	for (let offset = 0; offset < count; offset += 4) {
		const pid = pids.readInt32LE(offset);
		if (pid <= 0 || pid === process.pid) continue;
		const observed = inspectProcess(pid);
		if (observed.kind === "missing") continue;
		const env = environment(pid);
		if (!env.includes(`TRELLIS_ATTEMPT_ID=${id}`) || !env.includes(`TRELLIS_RUNTIME_HOME=${home}`)) continue;
		if (observed.kind === "unknown") throw new Error(observed.error);
		matches.push(observed.process);
	}
	return matches;
}
