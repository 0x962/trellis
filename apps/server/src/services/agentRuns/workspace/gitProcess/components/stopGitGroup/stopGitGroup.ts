const readProcesses = () => {
	const result = Bun.spawnSync(["/bin/ps", "-A", "-o", "pgid=,stat="], { stdout: "pipe", stderr: "pipe" });
	if (!result.success) throw new Error(result.stderr.toString().trim() || "Cannot read Git process group members");
	return result.stdout.toString();
};

export const stopGitGroup = (
	group: number,
	kill: (pid: number, signal: "SIGKILL") => unknown = process.kill,
	processes: () => string = readProcesses,
) => {
	try {
		kill(-group, "SIGKILL");
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		if (code === "ESRCH") return;
		if (code !== "EPERM") throw error;
		// macOS can return EPERM for a group whose members have all exited.
		// A zombie (state Z) has exited and waits for its parent to collect its status.
		for (const line of processes().trim().split("\n")) {
			const [id, state] = line.trim().split(/\s+/);
			if (Number(id) === group && !state?.startsWith("Z")) throw error;
		}
	}
};
