import { errno, load } from "koffi";
import { processIdentity } from "../processIdentity";
import { processEnvironmentReader } from "./processEnvironment.ts";

const library = load(null);
const sessionOf = library.func("int getsid(int pid)");
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
	const desktopSessions = new Set<number>();
	for (let offset = 0; offset < count; offset += 4) {
		const pid = pids.readInt32LE(offset);
		if (pid <= 0 || pid === process.pid) continue;
		const observed = processIdentity(pid);
		if (observed.kind === "missing") continue;
		const args = environment(pid);
		if (args === null) continue;
		// Trellis can inherit an agent environment when that agent opens the app.
		// Its desktop process session belongs to the person, not to that attempt.
		if (args.executable.includes("/Trellis.app/Contents/")) desktopSessions.add(sessionOf(pid));
		const env = args.environment;
		if (!env.includes(`TRELLIS_ATTEMPT_ID=${id}`) || !env.includes(`TRELLIS_RUNTIME_HOME=${home}`)) continue;
		if (observed.kind === "unknown") throw new Error(observed.error);
		matches.push(observed.process);
	}
	return matches.filter((match) => !desktopSessions.has(sessionOf(match.pid)));
}
