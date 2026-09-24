import {
	activeMachinePressureSignals,
	type MachinePressure as MachinePressureSample,
	type MachinePressureState,
	type ThermalState,
} from "@trellis/api";
import type { MachinePressureMachineView, MachinePressureReadingView } from "@trellis/ui";
import { formatBytes } from "../../../lib/format";
import type { DesktopThermalSample } from "../../../lib/desktopBridge";

export const thermalReadingForOrigin = (
	sample: DesktopThermalSample | null,
	origin: string,
): { value: ThermalState; sampledAt: number } | null =>
	sample?.hostOrigin === origin ? { value: sample.state, sampledAt: Date.parse(sample.sampledAt) } : null;

const titleCase = (value: string) => `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;

const readingView = (signal: ReturnType<typeof activeMachinePressureSignals>[number]): MachinePressureReadingView => {
	const freshness = signal.freshness === "stale" ? "stale" : "live";
	const tone = signal.tier === "danger" ? "danger" : "warning";
	if (signal.key === "cpuLoad")
		return {
			key: signal.key,
			label: "CPU load",
			value: (signal.reading!.value as number).toFixed(1),
			unit: "per core",
			tone,
			freshness,
		};
	if (signal.key === "memory") {
		const level = signal.reading!.value as number;
		return {
			key: signal.key,
			label: "Memory pressure",
			value: level === 4 ? "Critical" : "Warning",
			unit: `level ${level}`,
			tone,
			freshness,
		};
	}
	if (signal.key === "thermal")
		return {
			key: signal.key,
			label: "Thermal state",
			value: titleCase(signal.reading!.value as string),
			tone,
			freshness,
		};
	const reading = signal.reading as MachinePressureState["temperature"]["reading"];
	return {
		key: signal.key,
		label: "Processor temperature",
		value: reading!.value.toFixed(0),
		unit: "°C",
		tone,
		freshness,
		detail: `${reading!.sensor} sensor · ${reading!.readDurationMs.toFixed(1)} ms read`,
	};
};

const ageText = (state: MachinePressureState, now: number): string | undefined => {
	const stale = activeMachinePressureSignals(state).filter((signal) => signal.freshness === "stale");
	if (stale.length === 0) return undefined;
	const sampledAt = Math.min(...stale.map((signal) => signal.reading!.sampledAt));
	const seconds = Math.max(0, Math.floor((now - sampledAt) / 1_000));
	return `Last read ${seconds} s ago.`;
};

export const machinePressureView = (
	sample: MachinePressureSample,
	state: MachinePressureState,
	now: number,
): MachinePressureMachineView => ({
	id: "server",
	name: sample.hostname,
	readings: activeMachinePressureSignals(state).map(readingView),
	runs: sample.runs.map((run) => `${run.ticketIdentifier ?? run.name} ${formatBytes(run.memoryBytes)}`),
	ageText: ageText(state, now),
});
