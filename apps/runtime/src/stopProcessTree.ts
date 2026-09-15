import { constants } from "node:os";
import { errno, load } from "koffi";
import { processSnapshot } from "./processSnapshot/index.ts";
import { terminateSession } from "./terminateSession.ts";

const library = load(null);
const sessionOf = library.func("int getsid(int pid)");
const listPids = library.func("int proc_listpids(uint32_t type, uint32_t typeinfo, void *buffer, int buffersize)");
const pidInfo = library.func("int proc_pidinfo(int pid, int flavor, uint64_t arg, void *buffer, int buffersize)");

export async function stopProcessTree(sessionId: number) {
	return terminateSession(sessionId, {
		processes: () => processSnapshot({ listPids, pidInfo, errno }),
		sessionOf: (pid) => {
			const session = sessionOf(pid);
			if (session !== -1) return session;
			const failure = errno();
			if (failure === constants.errno.ESRCH) return -1;
			throw new Error(`Cannot inspect process ${pid}: getsid failed with errno ${failure}`);
		},
		killGroup: (group) => {
			try {
				process.kill(-group, "SIGKILL");
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
			}
		},
		now: () => performance.now(),
		wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
	});
}
