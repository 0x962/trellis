import { cpus, hostname, loadavg, platform } from "node:os";
import type { MachinePressure, MachinePressureInput, PressureRun } from "@trellis/api";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support.ts";
import { readRuntimeSessions } from "../agentRuns/liveState.ts";
import type { IoCtx } from "../support.ts";
import { readMemoryPressureLevel } from "./memoryPressureLevel.ts";
import { readProcessGroupMemory } from "./processGroupMemory.ts";
import { readProcessorTemperature } from "./processorTemperature.ts";

// The details panel names at most three runs.
const HEAVIEST_LIMIT = 3;

export type OpenRun = { id: string; name: string; ticketIdentifier: string | null; terminalId: string };

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
	const [memoryLevel, processorTemperature] = await Promise.all([
		readMemoryPressureLevel(),
		readProcessorTemperature(),
	]);
	const sampledAt = ctx.now().toISOString();
	const cpuCount = cpus().length;
	const loadAverage1m = loadavg()[0]!;
	const base = {
		sampledAt,
		hostname: hostname(),
		platform: platform(),
		cpuCount,
		loadAverage1m,
		loadPerCore: loadAverage1m / cpuCount,
		memoryLevel,
		processorTemperature,
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
