import { contextBridge, type IpcRendererEvent, ipcRenderer } from "electron";
import type {
	DesktopAction,
	DesktopServiceStatus,
	DesktopStatus,
	DesktopUpdateStatus,
} from "./desktopSettings/desktopSettings.ts";

contextBridge.exposeInMainWorld(
	"trellisDesktop",
	Object.freeze({
		platform: "darwin",
		chooseDirectory: (): Promise<string | null> => ipcRenderer.invoke("trellis:choose-directory"),
		status: (): Promise<DesktopStatus> => ipcRenderer.invoke("trellis:desktop-status"),
		serviceStatus: (): Promise<DesktopServiceStatus> => ipcRenderer.invoke("trellis:desktop-service-status"),
		updateStatus: (): Promise<DesktopUpdateStatus> => ipcRenderer.invoke("trellis:desktop-update-status"),
		setOpenAtLogin: (enabled: boolean): Promise<void> => ipcRenderer.invoke("trellis:set-open-at-login", enabled),
		run: (action: DesktopAction): Promise<void> => ipcRenderer.invoke("trellis:desktop-action", action),
		onNavigate: (listener: (path: string) => void) => {
			const handler = (_event: IpcRendererEvent, path: string) => listener(path);
			ipcRenderer.on("trellis:navigate", handler);
			return () => ipcRenderer.removeListener("trellis:navigate", handler);
		},
	}),
);
