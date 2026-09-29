import {
	type MachinePressure as MachinePressureSample,
	type MachinePressureState,
	machinePressureSignalKeys,
	memoryPressureName,
	type ThermalState,
} from "@trellis/api";
import type { MachinePressureMachineView, MachinePressureReadingView } from "@trellis/ui";
import type { DesktopThermalSample } from "../../../lib/desktopBridge";
import { formatBytes } from "../../../lib/format";

export const thermalReadingForOrigin = (
	sample: DesktopThermalSample | null,
	origin: string,
): { value: ThermalState; sampledAt: number } | null =>
	sample?.hostOrigin === origin ? { value: sample.state, sampledAt: Date.parse(sample.sampledAt) } : null;

const titleCase = (value: string) => `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;

const diskView = (signal: MachinePressureState["disk"], path: string): MachinePressureReadingView => {
	const disk = signal.reading?.value;
	return {
		key: "disk",
		label: "Disk space",
		value: disk ? `${(disk.availableBytes / 1024 ** 3).toFixed(1)} GiB` : "Unavailable",
		unit: disk ? "available" : undefined,
		tone: signal.tier,
		freshness: signal.freshness,
		detail: disk
			? `${(disk.totalBytes / 1024 ** 3).toFixed(1)} GiB total · ${disk.usedPercent.toFixed(1)}% used. Volume ${disk.volumeId} · ${disk.path}`
			: `Workspace volume · ${path}`,
	};
};

const readingView = (signal: MachinePressureState[keyof MachinePressureState]): MachinePressureReadingView => {
	if (signal.key === "disk") return diskView(signal as MachinePressureState["disk"], "");
	const tone = signal.tier;
	if (signal.key === "cpuLoad")
		return {
			key: signal.key,
			label: "CPU load",
			value: signal.reading ? (signal.reading.value as number).toFixed(1) : "Unavailable",
			unit: signal.reading ? "per core" : undefined,
			tone,
			freshness: signal.freshness,
		};
	if (signal.key === "memory") {
		return {
			key: signal.key,
			label: "Memory pressure",
			value: memoryPressureName(signal.reading ? (signal.reading.value as number) : null),
			tone,
			freshness: signal.freshness,
		};
	}
	if (signal.key === "thermal")
		return {
			key: signal.key,
			label: "Thermal pressure",
			value: signal.reading ? titleCase(signal.reading.value as string) : "Unavailable",
			tone,
			freshness: signal.freshness,
		};
	const reading = signal.reading as MachinePressureState["temperature"]["reading"];
	return {
		key: signal.key,
		label: "Processor temperature",
		value: reading ? reading.value.toFixed(0) : "Unavailable",
		unit: reading ? "°C" : undefined,
		tone,
		freshness: signal.freshness,
		detail: reading ? `${reading.sensor} sensor · ${reading.readDurationMs.toFixed(1)} ms read` : undefined,
	};
};

const ageText = (state: MachinePressureState, now: number): string | undefined => {
	const sampled = machinePressureSignalKeys.flatMap((key) =>
		state[key].reading ? [state[key].reading.sampledAt] : [],
	);
	if (sampled.length === 0) return undefined;
	const sampledAt = Math.min(...sampled);
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
	readings: machinePressureSignalKeys.map((key) =>
		key === "disk" ? diskView(state.disk, sample.disk.path) : readingView(state[key]),
	),
	runs: sample.runs.map((run) => `${run.ticketIdentifier ?? run.name} ${formatBytes(run.memoryBytes)}`),
	ageText: ageText(state, now),
});
