import { contextBridge, ipcRenderer } from "electron";
import type { DesktopAction, DesktopStatus } from "./desktopSettings/desktopSettings.ts";

contextBridge.exposeInMainWorld(
	"trellisDesktop",
	Object.freeze({
		platform: "darwin",
		chooseDirectory: (): Promise<string | null> => ipcRenderer.invoke("trellis:choose-directory"),
		status: (): Promise<DesktopStatus> => ipcRenderer.invoke("trellis:desktop-status"),
		setOpenAtLogin: (enabled: boolean): Promise<void> => ipcRenderer.invoke("trellis:set-open-at-login", enabled),
		run: (action: DesktopAction): Promise<void> => ipcRenderer.invoke("trellis:desktop-action", action),
	}),
);
