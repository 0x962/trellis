import { describe, expect, test } from "bun:test";
import type { DiskCapacity } from "@trellis/api";
import { runProcessorTemperatureReader } from "../processorTemperature.ts";
import {
	createLinuxHostMetricsReader,
	readLinuxHostMetrics,
	type LinuxHostMetricDeps,
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

const fixture = (files: Record<string, string>): LinuxHostMetricDeps => ({
	readFile: async (path) => {
		const value = files[path];
		if (value === undefined) throw new Error(`No fixture for ${path}`);
		return value;
	},
	readDisk: async () => disk,
	cpuCount: () => 16,
	loadAverage1m: () => 4,
	totalMemoryBytes: () => 64_000,
	freeMemoryBytes: () => 16_000,
	now: () => new Date("2026-09-27T20:00:01.000Z"),
	cgroupRoot: "/sys/fs/cgroup",
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
			cpu: { logicalCount: 16, effectiveCount: 2, loadAverage1m: 4, limitCores: 2 },
			memory: { usedBytes: 12_000, totalBytes: 64_000, limitBytes: 32_000 },
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
		expect(result.cpu).toEqual({ logicalCount: 16, effectiveCount: 3, loadAverage1m: 4, limitCores: 3 });
	});

	test("keeps the exact quota beside an integer effective count", async () => {
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
		expect(result.cpu).toEqual({ logicalCount: 16, effectiveCount: 2, loadAverage1m: 4, limitCores: 1.5 });
	});

	test("keeps host readings when proc and cgroup files are unavailable", async () => {
		const result = await readLinuxHostMetrics("/srv/trellis/agents", fixture({}));
		expect(result.cpu).toEqual({ logicalCount: 16, effectiveCount: 16, loadAverage1m: 4, limitCores: null });
		expect(result.memory).toEqual({ usedBytes: 48_000, totalBytes: 64_000, limitBytes: null });
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

	test("does not start a temperature reader on Linux", async () => {
		let started = false;
		const result = await runProcessorTemperatureReader({
			platform: "linux",
			path: "/release/bin/processor-temperature",
			exists: () => true,
			spawn: () => {
				started = true;
				throw new Error("unexpected helper");
			},
			now: () => 0,
			deadline: () => ({ wait: new Promise<"timeout">(() => {}), cancel: () => {} }),
		});
		expect(result).toEqual({ state: "unavailable", reason: "unsupported-platform", readDurationMs: 0 });
		expect(started).toBe(false);
	});
});
