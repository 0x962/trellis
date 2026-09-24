import { describe, expect, test } from "bun:test";
import {
	activeMachinePressureSignals,
	MachinePressureMonitor,
	type MachinePressureReadings,
} from "./machinePressure.ts";

const normal = (at: number): MachinePressureReadings => ({
	cpuLoad: { value: 0.4, sampledAt: at },
	memory: { value: 1, sampledAt: at },
	thermal: { value: "nominal", sampledAt: at },
	temperature: { value: 52, sampledAt: at, sensor: "PMU tdie6", readDurationMs: 2.5 },
	temperatureReader: "available",
});

const readingsWithHighMemoryAndTemperature = (at: number): MachinePressureReadings => ({
	...normal(at),
	memory: { value: 4, sampledAt: at },
	temperature: { value: 97, sampledAt: at, sensor: "PMU tdie6", readDurationMs: 2.5 },
});

describe("MachinePressureMonitor freshness", () => {
	test("keeps a high sample live through 15 seconds and stale until 60 seconds", () => {
		const monitor = new MachinePressureMonitor();
		const high = { ...normal(0), memory: { value: 4 as const, sampledAt: 0 } };
		expect(monitor.update(high, 0).memory.tier).toBe("danger");
		expect(monitor.update(high, 15_000).memory).toMatchObject({ tier: "danger", freshness: "live" });
		expect(monitor.update(high, 15_001).memory).toMatchObject({ tier: "danger", freshness: "stale" });
		expect(monitor.update(high, 59_999).memory).toMatchObject({
			tier: "danger",
			freshness: "stale",
			reading: { value: 4, sampledAt: 0 },
		});
		expect(monitor.update(high, 60_000).memory).toMatchObject({
			tier: "normal",
			freshness: "lost",
			reading: null,
		});
	});

	test("returns a stale signal to live when a fresh sample arrives", () => {
		const monitor = new MachinePressureMonitor();
		const high = (sampledAt: number) => ({ ...normal(sampledAt), memory: { value: 4 as const, sampledAt } });
		monitor.update(high(0), 0);
		expect(monitor.update(high(0), 15_001).memory.freshness).toBe("stale");
		expect(monitor.update(high(15_001), 15_001).memory).toMatchObject({ tier: "danger", freshness: "live" });
		expect(monitor.update(high(15_001), 75_000).memory.freshness).toBe("stale");
		expect(monitor.update(high(15_001), 75_001).memory).toMatchObject({
			tier: "normal",
			freshness: "lost",
			reading: null,
		});
	});

	test("keeps an unchanged serious thermal state current while reads continue", () => {
		const monitor = new MachinePressureMonitor();
		const serious = (sampledAt: number) => ({
			...normal(sampledAt),
			thermal: { value: "serious" as const, sampledAt },
		});
		expect(monitor.update(serious(0), 0).thermal.tier).toBe("danger");
		expect(monitor.update(serious(30_000), 30_000).thermal).toMatchObject({ tier: "danger", freshness: "live" });
		expect(monitor.update(serious(60_000), 60_000).thermal).toMatchObject({ tier: "danger", freshness: "live" });
		expect(monitor.update(serious(60_000), 75_000).thermal).toMatchObject({ tier: "danger", freshness: "live" });
		expect(monitor.update(serious(60_000), 75_001).thermal).toMatchObject({
			tier: "danger",
			freshness: "stale",
		});
		expect(monitor.update(serious(60_000), 120_000).thermal).toMatchObject({
			tier: "normal",
			freshness: "lost",
			reading: null,
		});
	});

	test("keeps an unavailable reader empty", () => {
		const monitor = new MachinePressureMonitor();
		const state = monitor.update({ ...normal(0), temperature: null, temperatureReader: "unavailable" }, 0);
		expect(state.temperature).toMatchObject({ tier: "normal", freshness: "unavailable", reading: null });
	});

	test("clears a signal when its native reading becomes unavailable", () => {
		const monitor = new MachinePressureMonitor();
		monitor.update({ ...normal(0), memory: { value: 4, sampledAt: 0 } }, 0);
		const state = monitor.update({ ...normal(1), memory: null }, 1);
		expect(state.memory).toMatchObject({ tier: "normal", freshness: "unavailable", reading: null });
	});

	test("clears a signal when its reader is lost", () => {
		const monitor = new MachinePressureMonitor();
		const high = {
			...normal(0),
			temperature: { value: 97, sampledAt: 0, sensor: "PMU tdie6", readDurationMs: 2.5 },
		};
		monitor.update(high, 0);
		monitor.update(
			{ ...high, temperature: { value: 97, sampledAt: 15_000, sensor: "PMU tdie6", readDurationMs: 2.5 } },
			15_000,
		);
		const state = monitor.update({ ...high, temperature: null, temperatureReader: "lost" }, 15_001).temperature;
		expect(state).toMatchObject({ tier: "normal", freshness: "lost", reading: null });
	});

	test("marks the last successful temperature stale after a reader failure", () => {
		const monitor = new MachinePressureMonitor();
		const high = {
			...normal(0),
			temperature: { value: 97, sampledAt: 0, sensor: "PMU tdie6", readDurationMs: 2.5 },
		};
		monitor.update(high, 0);
		monitor.update(
			{ ...high, temperature: { value: 97, sampledAt: 15_000, sensor: "PMU tdie6", readDurationMs: 2.5 } },
			15_000,
		);
		expect(
			monitor.update({ ...high, temperature: null, temperatureReader: "failed" }, 20_000).temperature,
		).toMatchObject({
			tier: "danger",
			freshness: "stale",
			reading: { value: 97, sampledAt: 15_000, sensor: "PMU tdie6" },
		});
		expect(
			monitor.update({ ...high, temperature: null, temperatureReader: "failed" }, 75_000).temperature,
		).toMatchObject({ tier: "normal", freshness: "lost", reading: null });
	});

	test("keeps other high signals active when one reader is lost", () => {
		const monitor = new MachinePressureMonitor();
		monitor.update(readingsWithHighMemoryAndTemperature(0), 0);
		monitor.update(readingsWithHighMemoryAndTemperature(15_000), 15_000);
		const oneLost = monitor.update(
			{ ...readingsWithHighMemoryAndTemperature(15_001), temperature: null, temperatureReader: "lost" },
			15_001,
		);
		expect(activeMachinePressureSignals(oneLost).map(({ key }) => key)).toEqual(["memory"]);
		const allLost = monitor.update(
			{
				...normal(75_000),
				memory: { value: 4, sampledAt: 15_000 },
				temperature: null,
				temperatureReader: "lost",
			},
			75_000,
		);
		expect(activeMachinePressureSignals(allLost)).toEqual([]);
	});

	test("requires the appearance dwell again after a lost sample returns", () => {
		const monitor = new MachinePressureMonitor();
		const high = (sampledAt: number) => ({ ...normal(sampledAt), cpuLoad: { value: 4.3, sampledAt } });
		monitor.update(high(0), 0);
		expect(monitor.update(high(10_000), 10_000).cpuLoad.tier).toBe("danger");
		expect(monitor.update(high(10_000), 70_000).cpuLoad).toMatchObject({ tier: "normal", freshness: "lost" });
		expect(monitor.update(high(70_001), 70_001).cpuLoad.tier).toBe("normal");
		expect(monitor.update(high(80_001), 80_001).cpuLoad.tier).toBe("danger");
	});
});
