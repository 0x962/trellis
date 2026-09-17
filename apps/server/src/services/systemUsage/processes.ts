import { basename } from "node:path";
import type { SystemProcess } from "@trellis/api";

const elapsedSeconds = (value: string) => {
	const [daysPart, clockPart = daysPart] = value.includes("-") ? value.split("-") : ["0", value];
	const clock = clockPart!.split(":").map(Number);
	const seconds = clock.pop()!;
	const minutes = clock.pop() ?? 0;
	const hours = clock.pop() ?? 0;
	return Number(daysPart) * 86_400 + hours * 3_600 + minutes * 60 + seconds;
};

export const parseProcesses = (stdout: string, memoryTotalBytes: number): SystemProcess[] =>
	stdout
		.trim()
		.split("\n")
		.map((line) => {
			const match = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+([\d.]+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(.+)$/.exec(line)!;
			const memoryBytes = Number(match[5]) * 1024;
			return {
				pid: Number(match[1]),
				parentPid: Number(match[2]),
				user: match[3]!,
				cpuPercent: Number(match[4]),
				memoryBytes,
				memoryPercent: (memoryBytes / memoryTotalBytes) * 100,
				elapsedSeconds: elapsedSeconds(match[6]!),
				state: match[7]![0]!,
				command: basename(match[8]!),
			};
		});

export const listProcesses = async (memoryTotalBytes: number) => {
	const proc = Bun.spawn(["/bin/ps", "-Ao", "pid=,ppid=,user=,pcpu=,rss=,etime=,state=,comm="], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const [code, stdout, stderr] = await Promise.all([
		proc.exited,
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	if (code !== 0) throw new Error(`/bin/ps exited ${code}: ${stderr.trim()}`);
	return parseProcesses(stdout, memoryTotalBytes);
};
