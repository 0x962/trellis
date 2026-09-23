import { cpus, freemem, hostname, loadavg, platform, totalmem, uptime } from "node:os";
import type { SystemProcesses, SystemUsage, SystemUsageSample } from "@trellis/api";
import type { IoCtx } from "../support.ts";
import { readMemoryPressureLevel } from "./memoryPressureLevel.ts";
import { listProcesses } from "./processes.ts";

type CpuTimes = { idle: number; total: number };

const HISTORY_LIMIT = 150;
const history: SystemUsageSample[] = [];

const cpuTimes = (): CpuTimes =>
	cpus().reduce(
		(sum, cpu) => {
			const total = Object.values(cpu.times).reduce((value, time) => value + time, 0);
			return { idle: sum.idle + cpu.times.idle, total: sum.total + total };
		},
		{ idle: 0, total: 0 },
	);

let previousCpuTimes = cpuTimes();

const cpuPercent = () => {
	const current = cpuTimes();
	const idle = current.idle - previousCpuTimes.idle;
	const total = current.total - previousCpuTimes.total;
	previousCpuTimes = current;
	return Math.round((1 - idle / total) * 1_000) / 10;
};

// `freemem` counts only the pages that hold nothing, so it reports a Mac with
// a large file cache as fully used. `/usr/bin/memory_pressure -Q` prints the
// share that macOS itself calls free, which is the share a new process can
// take. It prints a whole percent, so `memoryUsedBytes` below lands on a
// multiple of one percent of the memory. On a computer that is not a Mac the
// free pages are the whole answer.
const memoryUsedPercent = async (memoryTotalBytes: number): Promise<number> => {
	if (process.platform !== "darwin")
		return Math.round(((memoryTotalBytes - freemem()) / memoryTotalBytes) * 1_000) / 10;
	const proc = Bun.spawn(["/usr/bin/memory_pressure", "-Q"], { stdout: "pipe", stderr: "pipe" });
	const [code, stdout, stderr] = await Promise.all([
		proc.exited,
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	if (code !== 0) throw new Error(`/usr/bin/memory_pressure exited ${code}: ${stderr.trim()}`);
	return 100 - Number(/System-wide memory free percentage: (\d+)%/.exec(stdout)![1]);
};

export const prepareSystemUsage = async (ctx: IoCtx, _input: Record<string, never>): Promise<SystemUsage> => {
	const memoryTotalBytes = totalmem();
	const [memoryPercent, memoryLevel] = await Promise.all([
		memoryUsedPercent(memoryTotalBytes),
		readMemoryPressureLevel(),
	]);
	const sampledAt = ctx.now().toISOString();
	const currentCpuPercent = cpuPercent();
	const [oneMinuteLoad, fiveMinuteLoad, fifteenMinuteLoad] = loadavg();
	history.push({ at: sampledAt, cpuPercent: currentCpuPercent, memoryPercent, memoryLevel });
	history.splice(0, Math.max(0, history.length - HISTORY_LIMIT));
	const cpuList = cpus();
	return {
		sampledAt,
		hostname: hostname(),
		platform: platform(),
		cpuModel: cpuList[0]!.model,
		cpuCount: cpuList.length,
		cpuPercent: currentCpuPercent,
		memoryPercent,
		memoryLevel,
		memoryUsedBytes: Math.round((memoryPercent / 100) * memoryTotalBytes),
		memoryTotalBytes,
		loadAverage: [oneMinuteLoad!, fiveMinuteLoad!, fifteenMinuteLoad!],
		uptimeSeconds: Math.floor(uptime()),
		history: [...history],
	};
};

export const prepareSystemProcesses = async (ctx: IoCtx, _input: Record<string, never>): Promise<SystemProcesses> => {
	const processes = await listProcesses(totalmem());
	return { sampledAt: ctx.now().toISOString(), processCount: processes.length, processes };
};
