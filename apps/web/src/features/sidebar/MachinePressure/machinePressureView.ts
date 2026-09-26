import {
	activeMachinePressureSignals,
	type MachinePressure as MachinePressureSample,
	type MachinePressureState,
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

const readingView = (signal: ReturnType<typeof activeMachinePressureSignals>[number]): MachinePressureReadingView => {
	if (signal.key === "disk") return diskView(signal as MachinePressureState["disk"], "");
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
	const active = activeMachinePressureSignals(state);
	if (active.length === 0) return undefined;
	const sampledAt = Math.min(...active.map((signal) => signal.reading!.sampledAt));
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
	details: state.disk.tier === "normal" ? [diskView(state.disk, sample.disk.path)] : [],
	runs: sample.runs.map((run) => `${run.ticketIdentifier ?? run.name} ${formatBytes(run.memoryBytes)}`),
	ageText: ageText(state, now),
});
