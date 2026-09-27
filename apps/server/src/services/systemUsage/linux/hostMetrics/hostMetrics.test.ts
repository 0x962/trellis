import { describe, expect, test } from "bun:test";
import type { DiskCapacity } from "@trellis/api";
import {
	createLinuxHostMetricsReader,
	readLinuxHostMetrics,
	type LinuxHostMetricsReaderDeps,
} from "./hostMetrics.ts";

const disk: DiskCapacity = {
	state: "available",
	path: "/srv/trellis/agents",
	volumeId: "2049",
	sampledAt: "2026-09-27T20:00:00.000Z",
	availableBytes: 400,
	totalBytes: 1_000,
	usedPercent: 60,
};

const fixture = (files: Record<string, string>): LinuxHostMetricsReaderDeps => ({
	readFile: async (path) => {
		const value = files[path];
		if (value === undefined) throw new Error(`No fixture for ${path}`);
		return value;
	},
	readDisk: async () => disk,
	cpuCount: () => 16,
	loadAverage1m: () => 4,
	totalMemoryBytes: () => 64_000,
	now: () => new Date("2026-09-27T20:00:01.000Z"),
	cgroupRoot: "/sys/fs/cgroup",
	log: () => {},
});

describe("readLinuxHostMetrics", () => {
	test("uses the strictest CPU and memory limits in the cgroup hierarchy", async () => {
		const result = await readLinuxHostMetrics(
			"/srv/trellis/agents",
			fixture({
				"/proc/self/cgroup": "0::/trellis/host\n",
				"/sys/fs/cgroup/trellis/host/cpu.max": "300000 100000\n",
				"/sys/fs/cgroup/trellis/host/cpuset.cpus.effective": "0-7\n",
				"/sys/fs/cgroup/trellis/host/memory.max": "32000\n",
				"/sys/fs/cgroup/trellis/host/memory.current": "12000\n",
				"/sys/fs/cgroup/trellis/cpu.max": "200000 100000\n",
				"/sys/fs/cgroup/trellis/cpuset.cpus.effective": "0-3\n",
				"/sys/fs/cgroup/trellis/memory.max": "48000\n",
				"/sys/fs/cgroup/trellis/memory.current": "20000\n",
				"/sys/fs/cgroup/cpu.max": "max 100000\n",
				"/sys/fs/cgroup/cpuset.cpus.effective": "0-15\n",
				"/sys/fs/cgroup/memory.max": "max\n",
				"/sys/fs/cgroup/memory.current": "24000\n",
			}),
		);
		expect(result).toEqual({
			sampledAt: "2026-09-27T20:00:01.000Z",
			logicalCpuCount: 16,
			effectiveCpuCount: 2,
			loadAverage1m: 4,
			memoryUsedBytes: 12_000,
			memoryTotalBytes: 64_000,
			memoryLimitBytes: 32_000,
			memoryLimitKnown: true,
			disk,
		});
	});

	test("uses a CPU-set limit when it is stricter than the CPU quota", async () => {
		const result = await readLinuxHostMetrics(
			"/srv/trellis/agents",
			fixture({
				"/proc/self/cgroup": "0::/trellis\n",
				"/sys/fs/cgroup/trellis/cpu.max": "600000 100000\n",
				"/sys/fs/cgroup/trellis/cpuset.cpus.effective": "0-1,4\n",
				"/sys/fs/cgroup/trellis/memory.max": "max\n",
				"/sys/fs/cgroup/trellis/memory.current": "12000\n",
				"/sys/fs/cgroup/cpu.max": "max 100000\n",
				"/sys/fs/cgroup/cpuset.cpus.effective": "0-15\n",
				"/sys/fs/cgroup/memory.max": "max\n",
				"/sys/fs/cgroup/memory.current": "24000\n",
			}),
		);
		expect(result.effectiveCpuCount).toBe(3);
		expect(result.memoryUsedBytes).toBe(12_000);
		expect(result.memoryLimitBytes).toBeNull();
		expect(result.memoryLimitKnown).toBe(true);
	});

	test("keeps a fractional CPU quota", async () => {
		const result = await readLinuxHostMetrics(
			"/srv/trellis/agents",
			fixture({
				"/proc/self/cgroup": "0::/trellis\n",
				"/sys/fs/cgroup/trellis/cpu.max": "150000 100000\n",
				"/sys/fs/cgroup/trellis/cpuset.cpus.effective": "0-15\n",
				"/sys/fs/cgroup/trellis/memory.max": "max\n",
				"/sys/fs/cgroup/trellis/memory.current": "12000\n",
				"/sys/fs/cgroup/cpu.max": "max 100000\n",
				"/sys/fs/cgroup/cpuset.cpus.effective": "0-15\n",
				"/sys/fs/cgroup/memory.max": "max\n",
				"/sys/fs/cgroup/memory.current": "24000\n",
			}),
		);
		expect(result.logicalCpuCount).toBe(16);
		expect(result.effectiveCpuCount).toBe(1.5);
	});

	test("reports unknown cgroup readings without host fallbacks", async () => {
		const result = await readLinuxHostMetrics("/srv/trellis/agents", fixture({}));
		expect(result.effectiveCpuCount).toBeNull();
		expect(result.memoryUsedBytes).toBeNull();
		expect(result.memoryTotalBytes).toBe(64_000);
		expect(result.memoryLimitBytes).toBeNull();
		expect(result.memoryLimitKnown).toBe(false);
	});

	test("reports unknown CPU capacity when one quota file is unavailable", async () => {
		const result = await readLinuxHostMetrics(
			"/srv/trellis/agents",
			fixture({
				"/proc/self/cgroup": "0::/trellis\n",
				"/sys/fs/cgroup/trellis/cpuset.cpus.effective": "0-3\n",
				"/sys/fs/cgroup/trellis/memory.max": "max\n",
				"/sys/fs/cgroup/trellis/memory.current": "12000\n",
				"/sys/fs/cgroup/cpu.max": "max 100000\n",
				"/sys/fs/cgroup/cpuset.cpus.effective": "0-15\n",
				"/sys/fs/cgroup/memory.max": "max\n",
				"/sys/fs/cgroup/memory.current": "24000\n",
			}),
		);
		expect(result.effectiveCpuCount).toBeNull();
	});

	test("keeps a known memory limit when its usage file is unavailable", async () => {
		const result = await readLinuxHostMetrics(
			"/srv/trellis/agents",
			fixture({
				"/proc/self/cgroup": "0::/trellis\n",
				"/sys/fs/cgroup/trellis/cpu.max": "max 100000\n",
				"/sys/fs/cgroup/trellis/cpuset.cpus.effective": "0-15\n",
				"/sys/fs/cgroup/trellis/memory.max": "32000\n",
				"/sys/fs/cgroup/cpu.max": "max 100000\n",
				"/sys/fs/cgroup/cpuset.cpus.effective": "0-15\n",
				"/sys/fs/cgroup/memory.max": "max\n",
				"/sys/fs/cgroup/memory.current": "24000\n",
			}),
		);
		expect(result.memoryUsedBytes).toBeNull();
		expect(result.memoryLimitBytes).toBe(32_000);
		expect(result.memoryLimitKnown).toBe(true);
	});

	test("reports unknown memory use when an unlimited cgroup usage file is unavailable", async () => {
		const result = await readLinuxHostMetrics(
			"/srv/trellis/agents",
			fixture({
				"/proc/self/cgroup": "0::/trellis\n",
				"/sys/fs/cgroup/trellis/cpu.max": "max 100000\n",
				"/sys/fs/cgroup/trellis/cpuset.cpus.effective": "0-15\n",
				"/sys/fs/cgroup/trellis/memory.max": "max\n",
				"/sys/fs/cgroup/cpu.max": "max 100000\n",
				"/sys/fs/cgroup/cpuset.cpus.effective": "0-15\n",
				"/sys/fs/cgroup/memory.max": "max\n",
				"/sys/fs/cgroup/memory.current": "24000\n",
			}),
		);
		expect(result.memoryUsedBytes).toBeNull();
		expect(result.memoryLimitBytes).toBeNull();
		expect(result.memoryLimitKnown).toBe(true);
	});

	test("reads disk capacity from the workspace filesystem", async () => {
		let diskPath = "";
		const deps = fixture({});
		deps.readDisk = async (path) => {
			diskPath = path;
			return disk;
		};
		await readLinuxHostMetrics("/mnt/workspaces/agents", deps);
		expect(diskPath).toBe("/mnt/workspaces/agents");
	});

	test("logs one warning while the same cgroup read failure continues", async () => {
		const warnings: Array<Record<string, unknown> | undefined> = [];
		const deps = fixture({});
		deps.log = (_message, fields) => warnings.push(fields);
		const read = createLinuxHostMetricsReader(deps);
		await read("/srv/trellis/agents");
		await read("/srv/trellis/agents");
		expect(warnings).toEqual([{ path: "/proc/self/cgroup", error: "No fixture for /proc/self/cgroup" }]);
	});

	test("shares one active read between concurrent requests", async () => {
		let release: () => void = () => {};
		let procReads = 0;
		const deps = fixture({});
		deps.readFile = async (path) => {
			if (path !== "/proc/self/cgroup") throw new Error(`No fixture for ${path}`);
			procReads += 1;
			await new Promise<void>((resolve) => {
				release = resolve;
			});
			return "0::/\n";
		};
		const read = createLinuxHostMetricsReader(deps);
		const first = read("/srv/trellis/agents");
		const second = read("/srv/trellis/agents");
		expect(second).toBe(first);
		release();
		await first;
		expect(procReads).toBe(1);
	});
});
