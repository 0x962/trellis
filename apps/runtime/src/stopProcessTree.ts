import { execFileSync } from "node:child_process";
import { constants } from "node:os";
import { errno, load } from "koffi";
import { terminateSession } from "./terminateSession.ts";

let sessionOf: ((pid: number) => number) | undefined;
export async function stopProcessTree(sessionId: number) {
	sessionOf ??= load(null).func("int getsid(int pid)");
	return terminateSession(sessionId, {
		processes: () =>
			execFileSync("/bin/ps", ["-ax", "-o", "pid=,ppid=,pgid=,stat="], { encoding: "utf8", timeout: 1000 })
				.trim()
				.split("\n")
				.map((line) => {
					const [pid, parent, group, state] = line.trim().split(/\s+/);
					return { pid: Number(pid), parent: Number(parent), group: Number(group), state: state! };
				}),
		sessionOf: (pid) => {
			const session = sessionOf!(pid);
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
