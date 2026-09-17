import { describe, expect, test } from "bun:test";
import { parseProcesses } from "./processes.ts";

describe("parseProcesses", () => {
	test("parses process identity, load, memory, time, and state", () => {
		const rows = parseProcesses(
			"  181     1 navidkhan          12.5  10288 01-00:34:06 Ss   /System/Library/CoreServices/PowerChime",
			16 * 1024 * 1024,
		);

		expect(rows).toEqual([
			{
				pid: 181,
				parentPid: 1,
				user: "navidkhan",
				cpuPercent: 12.5,
				memoryBytes: 10_534_912,
				memoryPercent: 62.79296875,
				elapsedSeconds: 88_446,
				state: "S",
				command: "PowerChime",
			},
		]);
	});
});
