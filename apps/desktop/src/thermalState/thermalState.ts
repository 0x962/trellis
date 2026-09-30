import { type BrowserWindow, powerMonitor } from "electron";
import type { ThermalState } from "../desktopSettings/desktopSettings";

export function watchThermalState(window: () => BrowserWindow | undefined, rendererOrigin: () => string) {
	const send = (details: { state: ThermalState }) => {
		window()?.webContents.send("trellis:thermal-state", {
			state: details.state,
			sampledAt: new Date().toISOString(),
			hostOrigin: rendererOrigin(),
		});
	};
	powerMonitor.on("thermal-state-change", send);
	return () => powerMonitor.removeListener("thermal-state-change", send);
}
