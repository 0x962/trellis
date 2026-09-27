import { readFile } from "node:fs/promises";
import { cpus, freemem, loadavg, totalmem } from "node:os";
import type { DiskCapacity } from "@trellis/api";
import { readDiskCapacity } from "../../diskCapacity.ts";
import { createCgroupLimitReader } from "../cgroup/index.ts";

export type LinuxHostMetrics = {
	sampledAt: string;
	logicalCpuCount: number;
	effectiveCpuCount: number | null;
	loadAverage1m: number;
	memoryUsedBytes: number | null;
	memoryTotalBytes: number;
	memoryLimitBytes: number | null;
	memoryLimitKnown: boolean;
	disk: DiskCapacity;
};

export type LinuxHostMetricsReaderDeps = {
	readFile: (path: string) => Promise<string>;
	readDisk: (workspaceRoot: string) => Promise<DiskCapacity>;
	cpuCount: () => number;
	loadAverage1m: () => number;
	totalMemoryBytes: () => number;
	freeMemoryBytes: () => number;
	now: () => Date;
	cgroupRoot: string;
	log: (message: string, fields?: Record<string, unknown>) => void;
};

const nativeDeps = {
	readFile: (path: string) => readFile(path, "utf8"),
	readDisk: readDiskCapacity,
	cpuCount: () => cpus().length,
	loadAverage1m: () => loadavg()[0]!,
	totalMemoryBytes: totalmem,
	freeMemoryBytes: freemem,
	now: () => new Date(),
	cgroupRoot: "/sys/fs/cgroup",
};

const collectLinuxHostMetrics = async (
	workspaceRoot: string,
	deps: LinuxHostMetricsReaderDeps,
	readLimits: ReturnType<typeof createCgroupLimitReader>,
): Promise<LinuxHostMetrics> => {
	const logicalCpuCount = deps.cpuCount();
	const memoryTotalBytes = deps.totalMemoryBytes();
	const [limits, disk] = await Promise.all([readLimits(), deps.readDisk(workspaceRoot)]);
	const effectiveCpuCount =
		limits.cpuLimitKnown && limits.cpuSetKnown
			? Math.min(logicalCpuCount, limits.cpuCores ?? logicalCpuCount, limits.cpuSetCount ?? logicalCpuCount)
			: null;
	const memoryUsedBytes = !limits.memoryLimitKnown
		? null
		: limits.memoryBytes !== null && limits.memoryBytes < memoryTotalBytes
			? limits.memoryUsedBytes
			: memoryTotalBytes - deps.freeMemoryBytes();
	return {
		sampledAt: deps.now().toISOString(),
		logicalCpuCount,
		effectiveCpuCount,
		loadAverage1m: deps.loadAverage1m(),
		memoryUsedBytes,
		memoryTotalBytes,
		memoryLimitBytes: limits.memoryBytes,
		memoryLimitKnown: limits.memoryLimitKnown,
		disk,
	};
};

export const readLinuxHostMetrics = async (
	workspaceRoot: string,
	deps: LinuxHostMetricsReaderDeps,
): Promise<LinuxHostMetrics> =>
	collectLinuxHostMetrics(
		workspaceRoot,
		deps,
		createCgroupLimitReader({ readFile: deps.readFile, root: deps.cgroupRoot, log: deps.log }),
	);

export const createLinuxHostMetricsReader = (deps: LinuxHostMetricsReaderDeps) => {
	const readLimits = createCgroupLimitReader({ readFile: deps.readFile, root: deps.cgroupRoot, log: deps.log });
	let active: Promise<LinuxHostMetrics> | null = null;
	return (workspaceRoot: string) => {
		if (active !== null) return active;
		active = collectLinuxHostMetrics(workspaceRoot, deps, readLimits).finally(() => {
			active = null;
		});
		return active;
	};
};

let currentRead: Promise<LinuxHostMetrics> | null = null;
let currentLog: LinuxHostMetricsReaderDeps["log"] = () => {};
const readCurrentLimits = createCgroupLimitReader({
	readFile: nativeDeps.readFile,
	root: nativeDeps.cgroupRoot,
	log: (message, fields) => currentLog(message, fields),
});

export const readCurrentLinuxHostMetrics = (
	workspaceRoot: string,
	log: LinuxHostMetricsReaderDeps["log"],
): Promise<LinuxHostMetrics> => {
	if (currentRead !== null) return currentRead;
	currentLog = log;
	currentRead = collectLinuxHostMetrics(workspaceRoot, { ...nativeDeps, log }, readCurrentLimits).finally(() => {
		currentRead = null;
	});
	return currentRead;
};
