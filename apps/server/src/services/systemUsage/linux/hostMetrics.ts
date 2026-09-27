import { readFile } from "node:fs/promises";
import { cpus, freemem, loadavg, totalmem } from "node:os";
import type { DiskCapacity } from "@trellis/api";
import { readDiskCapacity } from "../diskCapacity.ts";
import { readCgroupLimits } from "./cgroup.ts";

export type LinuxHostCpu = {
	logicalCount: number;
	effectiveCount: number;
	loadAverage1m: number;
	limitCores: number | null;
};

export type LinuxHostMemory = {
	usedBytes: number;
	totalBytes: number;
	limitBytes: number | null;
};

export type LinuxHostMetrics = {
	sampledAt: string;
	cpu: LinuxHostCpu;
	memory: LinuxHostMemory;
	disk: DiskCapacity;
};

export type LinuxHostMetricDeps = {
	readFile: (path: string) => Promise<string>;
	readDisk: (workspaceRoot: string) => Promise<DiskCapacity>;
	cpuCount: () => number;
	loadAverage1m: () => number;
	totalMemoryBytes: () => number;
	freeMemoryBytes: () => number;
	now: () => Date;
	cgroupRoot: string;
};

const nativeDeps: LinuxHostMetricDeps = {
	readFile: (path) => readFile(path, "utf8"),
	readDisk: readDiskCapacity,
	cpuCount: () => cpus().length,
	loadAverage1m: () => loadavg()[0]!,
	totalMemoryBytes: totalmem,
	freeMemoryBytes: freemem,
	now: () => new Date(),
	cgroupRoot: "/sys/fs/cgroup",
};

export const readLinuxHostMetrics = async (
	workspaceRoot: string,
	deps: LinuxHostMetricDeps = nativeDeps,
): Promise<LinuxHostMetrics> => {
	const logicalCount = deps.cpuCount();
	const hostMemoryBytes = deps.totalMemoryBytes();
	const [limits, disk] = await Promise.all([
		readCgroupLimits({ readFile: deps.readFile, root: deps.cgroupRoot }),
		deps.readDisk(workspaceRoot),
	]);
	const cgroupCpuCount = Math.min(limits.cpuCores ?? logicalCount, limits.cpuSetCount ?? logicalCount);
	const cpuLimit = cgroupCpuCount < logicalCount ? cgroupCpuCount : null;
	const memoryLimit =
		limits.memoryBytes !== null && limits.memoryUsedBytes !== null && limits.memoryBytes < hostMemoryBytes
			? { usedBytes: Math.min(limits.memoryUsedBytes, limits.memoryBytes), limitBytes: limits.memoryBytes }
			: null;
	return {
		sampledAt: deps.now().toISOString(),
		cpu: {
			logicalCount,
			effectiveCount: cpuLimit ?? logicalCount,
			loadAverage1m: deps.loadAverage1m(),
			limitCores: cpuLimit,
		},
		memory: {
			totalBytes: hostMemoryBytes,
			...(memoryLimit ?? { usedBytes: hostMemoryBytes - deps.freeMemoryBytes(), limitBytes: null }),
		},
		disk,
	};
};

export const createLinuxHostMetricsReader = (deps: LinuxHostMetricDeps = nativeDeps) => {
	let active: Promise<LinuxHostMetrics> | null = null;
	return (workspaceRoot: string) => {
		if (active !== null) return active;
		active = readLinuxHostMetrics(workspaceRoot, deps).finally(() => {
			active = null;
		});
		return active;
	};
};

export const readCurrentLinuxHostMetrics = createLinuxHostMetricsReader();
