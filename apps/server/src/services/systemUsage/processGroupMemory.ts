// `/bin/ps -Ao pgid=,rss=` prints the process group and the resident memory in
// kilobytes, one line per process. These two columns cost about 0.25 s against
// the two thousand processes of a busy Mac. The eight columns of
// `listProcesses` cost about 1.2 s, because `ps` reads the command line and the
// user name of every process for them.
export const parseProcessGroupMemory = (stdout: string): Map<number, number> => {
	const totals = new Map<number, number>();
	for (const line of stdout.trim().split("\n")) {
		const match = /^\s*(\d+)\s+(\d+)\s*$/.exec(line)!;
		const group = Number(match[1]);
		totals.set(group, (totals.get(group) ?? 0) + Number(match[2]) * 1024);
	}
	return totals;
};

export const readProcessGroupMemory = async (): Promise<Map<number, number>> => {
	const proc = Bun.spawn(["/bin/ps", "-Ao", "pgid=,rss="], { stdout: "pipe", stderr: "pipe" });
	const [code, stdout, stderr] = await Promise.all([
		proc.exited,
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	if (code !== 0) throw new Error(`/bin/ps exited ${code}: ${stderr.trim()}`);
	return parseProcessGroupMemory(stdout);
};
