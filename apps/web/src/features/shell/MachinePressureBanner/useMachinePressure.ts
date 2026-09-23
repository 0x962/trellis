import { useQuery } from "@tanstack/react-query";
import { type PressureRun, type ThermalState, thermalIsRed } from "@trellis/api";
import { useEffect, useState } from "react";
import { useApp } from "../../../lib/appContext";
import type { DesktopBridge } from "../../../lib/desktopBridge";
import { type MemoryLevel, type PressureWarning, pressureWarning } from "./machinePressure";

// macOS raises an event when the thermal state changes, so the app reads the
// state once and then waits. A web browser exposes no thermal state and keeps
// null, and the banner then says nothing about heat.
function useThermalState(): ThermalState | null {
	const [state, setState] = useState<ThermalState | null>(null);
	useEffect(() => {
		const desktop = (window as Window & { trellisDesktop?: Partial<DesktopBridge> }).trellisDesktop;
		return desktop?.onThermalStateChanged?.(setState);
	}, []);
	return state;
}

// The kernel publishes no event for the memory pressure level, so the app asks
// for it. One read costs 10 to 30 milliseconds, and this poll stops while the
// window sits in the background.
const MEMORY_POLL_MS = 5_000;

export type MachinePressureState = {
	warning: PressureWarning | null;
	memoryLevel: MemoryLevel;
	runs: PressureRun[];
};

export function useMachinePressure(): MachinePressureState {
	const { orpc } = useApp();
	const thermal = useThermalState();
	const pressure = useQuery({
		...orpc.system.pressure.queryOptions({ input: { thermalIsRed: thermalIsRed(thermal) } }),
		refetchInterval: MEMORY_POLL_MS,
	});
	const memoryLevel = pressure.data?.memoryLevel ?? null;
	return { warning: pressureWarning({ memoryLevel, thermal }), memoryLevel, runs: pressure.data?.runs ?? [] };
}
