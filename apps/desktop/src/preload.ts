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
		sessionVisible: (runId: string | null): Promise<void> => ipcRenderer.invoke("trellis:session-visible", runId),
		previewNotification: (volume: number): Promise<void> => ipcRenderer.invoke("trellis:preview-notification", volume),
		onAccessibilitySupportChanged: (listener: (enabled: boolean) => void) => {
			const handler = (_event: IpcRendererEvent, enabled: boolean) => listener(enabled);
			ipcRenderer.on("trellis:accessibility-support", handler);
			void ipcRenderer.invoke("trellis:accessibility-ready");
			return () => ipcRenderer.removeListener("trellis:accessibility-support", handler);
		},
		chooseDirectory: (): Promise<string | null> => ipcRenderer.invoke("trellis:choose-directory"),
		status: (): Promise<DesktopStatus> => ipcRenderer.invoke("trellis:desktop-status"),
		serviceStatus: (): Promise<DesktopServiceStatus> => ipcRenderer.invoke("trellis:desktop-service-status"),
		updateStatus: (): Promise<DesktopUpdateStatus> => ipcRenderer.invoke("trellis:desktop-update-status"),
		setOpenAtLogin: (enabled: boolean): Promise<void> => ipcRenderer.invoke("trellis:set-open-at-login", enabled),
		run: (action: DesktopAction): Promise<void> => ipcRenderer.invoke("trellis:desktop-action", action),
		onNavigate: (listener: (path: string) => void) => {
			const handler = (_event: IpcRendererEvent, path: string) => listener(path);
			ipcRenderer.on("trellis:navigate", handler);
			void ipcRenderer.invoke("trellis:navigation-ready");
			return () => ipcRenderer.removeListener("trellis:navigate", handler);
		},
	}),
);
