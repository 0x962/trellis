import type { ProcessIdentity, ProcessIdentityObservation } from "../runtimePlatform.ts";

export type LinuxAttemptProcessOperations = {
	readDirectory: (path: string) => string[];
	readFile: (path: string) => string;
	ownerOf: (path: string) => number;
	uid: number;
	runtimePid: number;
	processIdentity: (pid: number) => ProcessIdentityObservation;
};

const absent = (error: unknown) => {
	const code = (error as NodeJS.ErrnoException).code;
	return code === "ENOENT" || code === "ESRCH";
};

// Every agent and its children inherit the attempt and runtime directory
// markers in their environment. /proc/<pid>/environ shows the memory that held
// the environment at the process start. A process can overwrite that memory,
// so a process that erases its markers is not in this list.
// A process that set itself non-dumpable, such as ssh-agent, has an environ
// file that only root can read. Its markers stay unknown, so this list skips
// it; the attempt cgroup still contains it if an agent started it.
export function createLinuxAttemptProcesses(operations: LinuxAttemptProcessOperations) {
	return (home: string, id: string): ProcessIdentity[] => {
		const matches: ProcessIdentity[] = [];
		for (const entry of operations.readDirectory("/proc")) {
			if (!/^\d+$/.test(entry)) continue;
			const pid = Number(entry);
			if (pid === operations.runtimePid) continue;
			let environment: string[];
			try {
				if (operations.ownerOf(`/proc/${pid}`) !== operations.uid) continue;
				environment = operations.readFile(`/proc/${pid}/environ`).split("\0");
			} catch (error) {
				if (absent(error) || (error as NodeJS.ErrnoException).code === "EACCES") continue;
				throw error;
			}
			if (!environment.includes(`TRELLIS_ATTEMPT_ID=${id}`) || !environment.includes(`TRELLIS_RUNTIME_HOME=${home}`))
				continue;
			const observed = operations.processIdentity(pid);
			if (observed.kind === "missing") continue;
			if (observed.kind === "unknown") throw new Error(observed.error);
			matches.push(observed.process);
		}
		return matches;
	};
}
