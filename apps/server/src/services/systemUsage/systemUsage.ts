import { cpus, freemem, hostname, loadavg, platform, totalmem, uptime } from "node:os";
import type { SystemUsage, SystemUsageSample } from "@trellis/api";
import type { IoCtx } from "../support.ts";
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

const memoryPressurePercent = async (memoryUsedBytes: number, memoryTotalBytes: number) => {
	if (process.platform !== "darwin") return Math.round((memoryUsedBytes / memoryTotalBytes) * 1_000) / 10;
	const proc = Bun.spawn(["/usr/bin/memory_pressure", "-Q"], { stdout: "pipe", stderr: "pipe" });
	const [code, stdout, stderr] = await Promise.all([
		proc.exited,
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	if (code !== 0) throw new Error(`/usr/bin/memory_pressure exited ${code}: ${stderr.trim()}`);
	const freePercent = Number(/System-wide memory free percentage: (\d+)%/.exec(stdout)![1]);
	return 100 - freePercent;
};

export const prepareSystemUsage = async (ctx: IoCtx, _input: Record<string, never>): Promise<SystemUsage> => {
	const memoryTotalBytes = totalmem();
	const memoryUsedBytes = memoryTotalBytes - freemem();
	const [memoryPercent, processes] = await Promise.all([
		memoryPressurePercent(memoryUsedBytes, memoryTotalBytes),
		listProcesses(memoryTotalBytes),
	]);
	const sampledAt = ctx.now().toISOString();
	const currentCpuPercent = cpuPercent();
	const [oneMinuteLoad, fiveMinuteLoad, fifteenMinuteLoad] = loadavg();
	history.push({ at: sampledAt, cpuPercent: currentCpuPercent, memoryPercent });
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
		memoryUsedBytes,
		memoryTotalBytes,
		loadAverage: [oneMinuteLoad!, fiveMinuteLoad!, fifteenMinuteLoad!],
		uptimeSeconds: Math.floor(uptime()),
		processCount: processes.length,
		history: [...history],
		processes,
	};
};
