import { describe, expect, test } from "bun:test";
import { type MachinePressure, MachinePressureMonitor, type MachinePressureReadings } from "@trellis/api";
import { machinePressureView, thermalReadingForOrigin } from "./machinePressureView";

const sample: MachinePressure = {
	sampledAt: "2026-09-24T20:00:00.000Z",
	hostname: "Canary-JQV57W1HPL",
	platform: "darwin",
	cpuCount: 16,
	loadAverage1m: 68.8,
	loadPerCore: 4.3,
	memoryLevel: 4,
	processorTemperature: {
		state: "available",
		celsius: 97,
		sensor: "PMU tdie6",
		source: "IOHIDEventSystemClient",
		readDurationMs: 2.5,
	},
	runs: [],
};

const readings = (at: number): MachinePressureReadings => ({
	cpuLoad: { value: 4.3, sampledAt: at },
	memory: { value: 4, sampledAt: at },
	thermal: { value: "critical", sampledAt: at },
	temperature: { value: 97, sampledAt: at, sensor: "PMU tdie6", readDurationMs: 2.5 },
	temperatureReader: "available",
});

describe("thermalReadingForOrigin", () => {
	test("uses a desktop state only for the server origin that supplied the page", () => {
		const desktop = {
			state: "serious" as const,
			sampledAt: "2026-09-24T20:00:00.000Z",
			hostOrigin: "http://127.0.0.1:4521",
		};
		expect(thermalReadingForOrigin(desktop, desktop.hostOrigin)).toEqual({
			value: "serious",
			sampledAt: Date.parse(desktop.sampledAt),
		});
		expect(thermalReadingForOrigin(desktop, "http://127.0.0.1:9999")).toBeNull();
	});
});

describe("machinePressureView", () => {
	test("labels the source machine and each active reading", () => {
		const monitor = new MachinePressureMonitor();
		monitor.update(readings(0), 0);
		const view = machinePressureView(sample, monitor.update(readings(15_000), 15_000), 15_000);
		expect(view.name).toBe("Canary-JQV57W1HPL");
		expect(view.readings.map(({ label, value, unit }) => ({ label, value, unit }))).toEqual([
			{ label: "CPU load", value: "4.3", unit: "per core" },
			{ label: "Memory pressure", value: "Critical", unit: "level 4" },
			{ label: "Thermal state", value: "Critical", unit: undefined },
			{ label: "Processor temperature", value: "97", unit: "°C" },
		]);
		expect(view.readings.at(-1)?.detail).toBe("PMU tdie6 sensor · 2.5 ms read");
		expect(view.ageText).toBe("Last read 0 s ago.");
	});

	test("omits a lost temperature while other high signals stay visible", () => {
		const monitor = new MachinePressureMonitor();
		monitor.update(readings(0), 0);
		monitor.update(readings(15_000), 15_000);
		const lost = monitor.update({ ...readings(15_001), temperature: null, temperatureReader: "lost" }, 15_001);
		const view = machinePressureView(sample, lost, 15_001);
		expect(view.readings.map(({ key }) => key)).toEqual(["cpuLoad", "memory", "thermal"]);
		expect(view.ageText).toBe("Last read 0 s ago.");
	});

	test("marks a retained high sample as stale and shows its age", () => {
		const monitor = new MachinePressureMonitor();
		monitor.update(readings(0), 0);
		monitor.update(readings(15_000), 15_000);
		const stale = monitor.update(readings(15_000), 49_001);
		const view = machinePressureView(sample, stale, 49_001);
		expect(view.readings.every((reading) => reading.freshness === "stale")).toBe(true);
		expect(view.ageText).toBe("Last read 34 s ago.");
	});
});
