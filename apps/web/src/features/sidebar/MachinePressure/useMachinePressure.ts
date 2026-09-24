import { useQuery } from "@tanstack/react-query";
import { MachinePressureMonitor, type MachinePressureReadings } from "@trellis/api";
import type { MachinePressureMachineView } from "@trellis/ui";
import { useEffect, useRef, useState } from "react";
import { useApp } from "../../../lib/appContext";
import type { DesktopBridge, DesktopThermalSample } from "../../../lib/desktopBridge";
import { machinePressureView, thermalReadingForOrigin } from "./machinePressureView";

const PRESSURE_POLL_MS = 5_000;

type ThermalCycle = { sample: DesktopThermalSample | null; refreshedAt: number };

function useDesktopThermalSample(refreshedAt: number): ThermalCycle {
	const [cycle, setCycle] = useState<ThermalCycle>({ sample: null, refreshedAt: 0 });
	useEffect(() => {
		const desktop = (window as Window & { trellisDesktop?: Partial<DesktopBridge> }).trellisDesktop;
		return desktop?.onThermalStateChanged?.((sample) => setCycle((current) => ({ ...current, sample })));
	}, []);
	useEffect(() => {
		if (refreshedAt === 0) return;
		const desktop = (window as Window & { trellisDesktop?: Partial<DesktopBridge> }).trellisDesktop;
		if (!desktop?.refreshThermalState) {
			setCycle({ sample: null, refreshedAt });
			return;
		}
		let current = true;
		void desktop.refreshThermalState().then(
			(sample) => {
				if (current) setCycle({ sample, refreshedAt });
			},
			() => {
				if (current) setCycle((previous) => ({ ...previous, refreshedAt }));
			},
		);
		return () => {
			current = false;
		};
	}, [refreshedAt]);
	return cycle;
}

export function useMachinePressure() {
	const { orpc } = useApp();
	const monitor = useRef(new MachinePressureMonitor());
	const [open, setOpen] = useState(false);
	const [machines, setMachines] = useState<MachinePressureMachineView[]>([]);
	const pressure = useQuery({
		...orpc.system.pressure.queryOptions({ input: { includeRuns: open } }),
		refetchInterval: PRESSURE_POLL_MS,
	});
	const thermalCycle = useDesktopThermalSample(pressure.dataUpdatedAt);
	const sample = pressure.data;
	// biome-ignore lint/correctness/useExhaustiveDependencies: A failed poll changes only `errorUpdatedAt`, and that change must age the last sample.
	useEffect(() => {
		if (!sample || thermalCycle.refreshedAt !== pressure.dataUpdatedAt) return;
		const now = Date.now();
		const sampledAt = Date.parse(sample.sampledAt);
		const processorTemperature = sample.processorTemperature;
		const readings: MachinePressureReadings = {
			cpuLoad: { value: sample.loadPerCore, sampledAt },
			memory: sample.memoryLevel === null ? null : { value: sample.memoryLevel, sampledAt },
			thermal: thermalReadingForOrigin(thermalCycle.sample, window.location.origin),
			temperature:
				processorTemperature.state === "available"
					? {
							value: processorTemperature.celsius,
							sampledAt,
							sensor: processorTemperature.sensor,
							readDurationMs: processorTemperature.readDurationMs,
						}
					: null,
			temperatureReader: processorTemperature.state,
		};
		const state = monitor.current.update(readings, now);
		const machine = machinePressureView(sample, state, now);
		setMachines([machine]);
		if (machine.readings.length === 0) setOpen(false);
	}, [pressure.dataUpdatedAt, pressure.errorUpdatedAt, sample, thermalCycle]);
	return { machines, open, setOpen };
}
