import { describe, expect, test } from "bun:test";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { heaviestRuns, hostLoad, type OpenRun } from "./machinePressure.ts";
import { parseProcessGroupMemory } from "./processGroupMemory.ts";

const run = (id: string, terminalId: string): OpenRun => ({
	id,
	name: `agent ${id}`,
	ticketIdentifier: `TRL-${id}`,
	terminalId,
});

const session = (id: string, groupId: number | null): RuntimeProcessStatus =>
	({
		id,
		process:
			groupId === null ? null : { pid: groupId, parentPid: 1, groupId, identity: "", startedAt: "", executable: "" },
	}) as RuntimeProcessStatus;

describe("parseProcessGroupMemory", () => {
	test("sums the resident kilobytes of every process in a group", () => {
		expect(parseProcessGroupMemory("  900  1024\n  900  2048\n 901   512\n")).toEqual(
			new Map([
				[900, 3_145_728],
				[901, 524_288],
			]),
		);
	});
});

describe("hostLoad", () => {
	test("reports the one-minute load per logical CPU", () => {
		expect(hostLoad("darwin", 16, 68.8)).toEqual({ loadAverage1m: 68.8, loadPerCore: 4.3 });
	});

	test("does not report the false zero load that Node returns on Windows", () => {
		expect(hostLoad("win32", 16, 0)).toEqual({ loadAverage1m: null, loadPerCore: null });
	});

	test("does not divide a load by an unavailable logical CPU count", () => {
		expect(hostLoad("darwin", 0, 4)).toEqual({ loadAverage1m: null, loadPerCore: null });
	});
});

describe("heaviestRuns", () => {
	test("orders the runs by the memory of their process group", () => {
		const memory = new Map([
			[900, 1_000],
			[901, 3_000],
			[902, 2_000],
		]);
		const sessions = [session("t1", 900), session("t2", 901), session("t3", 902)];
		expect(heaviestRuns([run("1", "t1"), run("2", "t2"), run("3", "t3")], sessions, memory, 3)).toEqual([
			{ id: "2", name: "agent 2", ticketIdentifier: "TRL-2", memoryBytes: 3_000 },
			{ id: "3", name: "agent 3", ticketIdentifier: "TRL-3", memoryBytes: 2_000 },
			{ id: "1", name: "agent 1", ticketIdentifier: "TRL-1", memoryBytes: 1_000 },
		]);
	});

	test("keeps only the count the caller asks for", () => {
		const memory = new Map([
			[900, 1_000],
			[901, 3_000],
		]);
		const sessions = [session("t1", 900), session("t2", 901)];
		expect(heaviestRuns([run("1", "t1"), run("2", "t2")], sessions, memory, 1)).toMatchObject([{ id: "2" }]);
	});

	test("leaves out a run whose process group holds no known memory", () => {
		const sessions = [session("t1", 900), session("t2", null)];
		expect(heaviestRuns([run("1", "t1"), run("2", "t2"), run("3", "t9")], sessions, new Map(), 3)).toEqual([]);
	});
});
