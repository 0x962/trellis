import { cpus, freemem, hostname, loadavg, platform, totalmem } from "node:os";
import type { MachinePressure, MachinePressureInput, PressureRun } from "@trellis/api";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { agentWorkspacesRoot } from "../../agents/native/workspace.ts";
import { rows } from "../../db/queries/support.ts";
import { readRuntimeSessions } from "../agentRuns.ts";
import type { IoCtx } from "../support.ts";
import { readDiskCapacity } from "./diskCapacity.ts";
import { type LinuxHostMetrics, readCurrentLinuxHostMetrics } from "./linux/hostMetrics/index.ts";
import { readMemoryPressureLevel } from "./memoryPressureLevel.ts";
import { readProcessGroupMemory } from "./processGroupMemory.ts";
import { readProcessorTemperature } from "./processorTemperature.ts";

const HEAVIEST_LIMIT = 3;

export type OpenRun = { id: string; name: string; ticketIdentifier: string | null; terminalId: string };

export const hostLoad = (hostPlatform: string, effectiveCpuCount: number | null, loadAverage1m: number) => {
	if (hostPlatform === "win32" || effectiveCpuCount === 0) return { loadAverage1m: null, loadPerCore: null };
	if (effectiveCpuCount === null) return { loadAverage1m, loadPerCore: null };
	return { loadAverage1m, loadPerCore: loadAverage1m / effectiveCpuCount };
};

export const hostMemory = (
	metrics: LinuxHostMetrics | null,
	readTotalMemory: () => number = totalmem,
	readFreeMemory: () => number = freemem,
): Pick<MachinePressure, "memoryUsedBytes" | "memoryTotalBytes" | "memoryLimitBytes" | "memoryLimitKnown"> => {
	if (metrics !== null)
		return {
			memoryUsedBytes: metrics.memoryUsedBytes,
			memoryTotalBytes: metrics.memoryTotalBytes,
			memoryLimitBytes: metrics.memoryLimitBytes,
			memoryLimitKnown: metrics.memoryLimitKnown,
		};
	const memoryTotalBytes = readTotalMemory();
	return {
		memoryUsedBytes: memoryTotalBytes - readFreeMemory(),
		memoryTotalBytes,
		memoryLimitBytes: null,
		memoryLimitKnown: true,
	};
};

// A run holds a terminal, the terminal holds a process group, and the process
// group holds the memory. A run whose terminal or process group is gone holds
// no known memory, so it is left out rather than shown with a guessed number.
export const heaviestRuns = (
	runs: OpenRun[],
	sessions: RuntimeProcessStatus[],
	memoryByGroup: Map<number, number>,
	limit: number,
): PressureRun[] => {
	const groupByTerminal = new Map(
		sessions.flatMap((session) => (session.process === null ? [] : [[session.id, session.process.groupId] as const])),
	);
	return runs
		.flatMap((run) => {
			const group = groupByTerminal.get(run.terminalId);
			const memoryBytes = group === undefined ? undefined : memoryByGroup.get(group);
			if (memoryBytes === undefined) return [];
			return [{ id: run.id, name: run.name, ticketIdentifier: run.ticketIdentifier, memoryBytes }];
		})
		.sort((left, right) => right.memoryBytes - left.memoryBytes)
		.slice(0, limit);
};

export const prepareMachinePressure = async (ctx: IoCtx, input: MachinePressureInput): Promise<MachinePressure> => {
	const hostPlatform = platform();
	const workspaceRoot = agentWorkspacesRoot(ctx.home);
	const linuxMetrics = hostPlatform === "linux" ? readCurrentLinuxHostMetrics(workspaceRoot, ctx.log) : null;
	const [memoryLevel, processorTemperature, disk] = await Promise.all([
		readMemoryPressureLevel(),
		readProcessorTemperature(),
		linuxMetrics?.then((metrics) => metrics.disk) ?? readDiskCapacity(workspaceRoot),
	]);
	const metrics = await linuxMetrics;
	const sampledAt = metrics?.sampledAt ?? ctx.now().toISOString();
	const cpuCount = metrics?.logicalCpuCount ?? cpus().length;
	const effectiveCpuCount = metrics === null ? cpuCount : metrics.effectiveCpuCount;
	const loadAverage1m = metrics?.loadAverage1m ?? loadavg()[0]!;
	const base = {
		sampledAt,
		hostname: hostname(),
		platform: hostPlatform,
		cpuCount,
		effectiveCpuCount: metrics?.effectiveCpuCount,
		...hostLoad(hostPlatform, effectiveCpuCount, loadAverage1m),
		memoryLevel,
		...hostMemory(metrics),
		processorTemperature,
		disk,
	};
	if (!input.includeRuns) return { ...base, runs: [] };
	const openRuns = await ctx.newTx((tx) =>
		rows<OpenRun>(
			tx,
			sql`SELECT id, name, ticket_identifier AS "ticketIdentifier", terminal_id AS "terminalId"
				FROM agent_runs WHERE closed_at IS NULL AND terminal_id IS NOT NULL`,
		),
	);
	if (openRuns.length === 0) return { ...base, runs: [] };
	const [sessions, memoryByGroup] = await Promise.all([
		readRuntimeSessions(ctx.home, { ids: openRuns.map((run) => run.terminalId) }),
		readProcessGroupMemory(),
	]);
	return { ...base, runs: heaviestRuns(openRuns, sessions, memoryByGroup, HEAVIEST_LIMIT) };
};
