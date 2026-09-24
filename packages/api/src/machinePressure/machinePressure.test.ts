import { describe, expect, test } from "bun:test";
import {
	activeMachinePressureSignals,
	MACHINE_PRESSURE_POLICY,
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

describe("MACHINE_PRESSURE_POLICY", () => {
	test("keeps separate appearance and recovery lines for numeric readings", () => {
		expect(MACHINE_PRESSURE_POLICY.cpuLoad).toMatchObject({
			warningAt: 2,
			dangerAt: 4,
			warningRecoveryBelow: 1.5,
			dangerRecoveryBelow: 3,
		});
		expect(MACHINE_PRESSURE_POLICY.temperature).toMatchObject({
			warningAt: 85,
			dangerAt: 95,
			warningRecoveryBelow: 80,
			dangerRecoveryBelow: 88,
		});
	});
});

describe("MachinePressureMonitor", () => {
	test("keeps normal live readings out of the active signal list", () => {
		const monitor = new MachinePressureMonitor();
		expect(activeMachinePressureSignals(monitor.update(normal(0), 0))).toEqual([]);
	});

	test("applies the CPU dwell and two recovery lines", () => {
		const monitor = new MachinePressureMonitor();
		const high = { ...normal(0), cpuLoad: { value: 4.3, sampledAt: 0 } };
		expect(monitor.update(high, 0).cpuLoad.tier).toBe("normal");
		expect(monitor.update({ ...high, cpuLoad: { value: 4.3, sampledAt: 9_999 } }, 9_999).cpuLoad.tier).toBe(
			"normal",
		);
		expect(monitor.update({ ...high, cpuLoad: { value: 4.3, sampledAt: 10_000 } }, 10_000).cpuLoad.tier).toBe(
			"danger",
		);
		expect(monitor.update({ ...high, cpuLoad: { value: 2.5, sampledAt: 10_001 } }, 10_001).cpuLoad.tier).toBe(
			"danger",
		);
		expect(monitor.update({ ...high, cpuLoad: { value: 2.5, sampledAt: 70_001 } }, 70_001).cpuLoad.tier).toBe(
			"warning",
		);
		expect(monitor.update({ ...high, cpuLoad: { value: 1.4, sampledAt: 70_002 } }, 70_002).cpuLoad.tier).toBe(
			"warning",
		);
		expect(monitor.update({ ...high, cpuLoad: { value: 1.4, sampledAt: 130_002 } }, 130_002).cpuLoad.tier).toBe(
			"normal",
		);
	});

	test("shows critical memory at once and clears it after recovery", () => {
		const monitor = new MachinePressureMonitor();
		expect(monitor.update({ ...normal(0), memory: { value: 4, sampledAt: 0 } }, 0).memory.tier).toBe("danger");
		expect(monitor.update({ ...normal(1), memory: { value: 1, sampledAt: 1 } }, 1).memory.tier).toBe("danger");
		expect(monitor.update({ ...normal(30_001), memory: { value: 1, sampledAt: 30_001 } }, 30_001).memory.tier).toBe(
			"normal",
		);
	});

	test("requires a sustained warning memory level", () => {
		const monitor = new MachinePressureMonitor();
		expect(monitor.update({ ...normal(0), memory: { value: 2, sampledAt: 0 } }, 0).memory.tier).toBe("normal");
		expect(monitor.update({ ...normal(60_000), memory: { value: 2, sampledAt: 60_000 } }, 60_000).memory.tier).toBe(
			"warning",
		);
	});

	test("moves thermal danger through warning before it clears", () => {
		const monitor = new MachinePressureMonitor();
		expect(monitor.update({ ...normal(0), thermal: { value: "serious", sampledAt: 0 } }, 0).thermal.tier).toBe(
			"danger",
		);
		expect(
			monitor.update({ ...normal(1), thermal: { value: "fair", sampledAt: 1 } }, 1).thermal.tier,
		).toBe("danger");
		expect(
			monitor.update({ ...normal(60_001), thermal: { value: "fair", sampledAt: 60_001 } }, 60_001).thermal.tier,
		).toBe("warning");
		expect(
			monitor.update({ ...normal(120_002), thermal: { value: "nominal", sampledAt: 120_002 } }, 120_002)
				.thermal.tier,
		).toBe("warning");
		expect(
			monitor.update({ ...normal(180_002), thermal: { value: "nominal", sampledAt: 180_002 } }, 180_002)
				.thermal.tier,
		).toBe("normal");
	});

	test("uses temperature dwell and hysteresis", () => {
		const monitor = new MachinePressureMonitor();
		const temperature = (value: number, sampledAt: number) => ({
			value,
			sampledAt,
			sensor: "PMU tdie6",
			readDurationMs: 2.5,
		});
		expect(monitor.update({ ...normal(0), temperature: temperature(97, 0) }, 0).temperature.tier).toBe("normal");
		expect(
			monitor.update({ ...normal(15_000), temperature: temperature(97, 15_000) }, 15_000).temperature.tier,
		).toBe("danger");
		expect(
			monitor.update({ ...normal(15_001), temperature: temperature(87, 15_001) }, 15_001).temperature.tier,
		).toBe("danger");
		expect(
			monitor.update({ ...normal(75_001), temperature: temperature(87, 75_001) }, 75_001).temperature.tier,
		).toBe("warning");
		expect(
			monitor.update({ ...normal(75_002), temperature: temperature(79, 75_002) }, 75_002).temperature.tier,
		).toBe("warning");
		expect(
			monitor.update({ ...normal(135_002), temperature: temperature(79, 135_002) }, 135_002).temperature.tier,
		).toBe("normal");
	});

	test("shows all four signals after their appearance dwell", () => {
		const monitor = new MachinePressureMonitor();
		const allHigh: MachinePressureReadings = {
			cpuLoad: { value: 4.3, sampledAt: 0 },
			memory: { value: 4, sampledAt: 0 },
			thermal: { value: "critical", sampledAt: 0 },
			temperature: { value: 97, sampledAt: 0, sensor: "PMU tdie6", readDurationMs: 2.5 },
			temperatureReader: "available",
		};
		monitor.update(allHigh, 0);
		const state = monitor.update(
			{
				...allHigh,
				cpuLoad: { value: 4.3, sampledAt: 15_000 },
				memory: { value: 4, sampledAt: 15_000 },
				thermal: { value: "critical", sampledAt: 15_000 },
				temperature: { ...allHigh.temperature!, sampledAt: 15_000 },
			},
			15_000,
		);
		expect(activeMachinePressureSignals(state).map(({ key, tier }) => ({ key, tier }))).toEqual([
			{ key: "cpuLoad", tier: "danger" },
			{ key: "memory", tier: "danger" },
			{ key: "thermal", tier: "danger" },
			{ key: "temperature", tier: "danger" },
		]);
	});
});
