import { execFileSync } from "node:child_process";

export function stopProcessTree(pid: number) {
	const rows = execFileSync("/bin/ps", ["-ax", "-o", "pid=,ppid=,pgid="], { encoding: "utf8" })
		.trim()
		.split("\n")
		.map((line) => {
			const [pid, ppid, pgid] = line.trim().split(/\s+/).map(Number);
			return { pid: pid!, ppid: ppid!, pgid: pgid! };
		});
	const descendants = new Set([pid]);
	let changed = true;
	while (changed) {
		changed = false;
		for (const row of rows)
			if (descendants.has(row.ppid) && !descendants.has(row.pid)) {
				descendants.add(row.pid);
				changed = true;
			}
	}
	const groups = new Set(rows.filter((row) => descendants.has(row.pid)).map((row) => row.pgid));
	for (const group of groups) {
		try {
			process.kill(-group, "SIGKILL");
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
		}
	}
}
