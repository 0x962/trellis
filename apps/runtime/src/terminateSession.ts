export type SessionProcess = { pid: number; parent: number; group: number; state: string };
export type SessionOperations = {
	processes: () => SessionProcess[];
	sessionOf: (pid: number) => number;
	killGroup: (group: number) => void;
	now: () => number;
	wait: (ms: number) => Promise<void>;
};
export async function terminateSession(sessionId: number, operations: SessionOperations) {
	const deadline = operations.now() + 2000;
	const sessions = new Set([sessionId]);
	while (true) {
		const processes = operations.processes().filter((item) => !item.state.startsWith("Z"));
		const identities = new Map(processes.map((item) => [item.pid, operations.sessionOf(item.pid)]));
		if (identities.get(sessionId) === sessionId) {
			const descendants = new Set([sessionId]);
			let added = true;
			while (added) {
				added = false;
				for (const item of processes) {
					if (!descendants.has(item.parent) || descendants.has(item.pid)) continue;
					descendants.add(item.pid);
					added = true;
				}
			}
			for (const pid of descendants) {
				const identity = identities.get(pid)!;
				if (identity > 0) sessions.add(identity);
			}
		}
		const members = processes.filter((item) => sessions.has(identities.get(item.pid)!));
		if (members.length === 0) return;
		if (operations.now() >= deadline)
			throw new Error(`Process session ${sessionId} still has live members after SIGKILL`);
		for (const group of new Set(members.map((item) => item.group))) {
			if (members.some((item) => item.group === group && sessions.has(operations.sessionOf(item.pid))))
				operations.killGroup(group);
		}
		await operations.wait(20);
	}
}
