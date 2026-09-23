// Every path that a process on this computer holds open right now.
//
// `lsof -F n` prints one line per open file. A line that starts with `n`
// holds the path, and the list covers the current directory of a process,
// each file it reads or writes, and each file it maps into memory. A
// scratch directory that a build, a test server or a runtime daemon still
// uses appears here, so the sweep leaves that directory alone.
//
// `-w` drops the warnings about the directories that lsof cannot read, `-n`
// and `-P` skip the host and the port lookups, and macOS keeps the program
// at /usr/sbin/lsof. A read of every process takes about half a second and
// the sweep runs once an hour.
//
// A failed read throws, and the caller then removes nothing: a short list
// reads as "no process holds this directory" and would remove the files of
// a live agent.
export const openPaths = async (): Promise<string[]> => {
	const proc = Bun.spawn(["/usr/sbin/lsof", "-w", "-n", "-P", "-F", "n"], { stdout: "pipe", stderr: "pipe" });
	const [text, error, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	if (code !== 0) throw new Error(`/usr/sbin/lsof exited ${code}: ${error.trim()}`);
	const paths: string[] = [];
	for (const line of text.split("\n")) if (line.startsWith("n/")) paths.push(line.slice(1));
	return paths;
};
