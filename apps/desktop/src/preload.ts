import { contextBridge, type IpcRendererEvent, ipcRenderer } from "electron";
import type {
	DesktopAction,
	DesktopServiceStatus,
	DesktopStatus,
	DesktopThermalSample,
	DesktopUpdateStatus,
} from "./desktopSettings/desktopSettings.ts";

const refreshThermalState = (): Promise<DesktopThermalSample> => ipcRenderer.invoke("trellis:thermal-ready");

contextBridge.exposeInMainWorld(
	"trellisDesktop",
	Object.freeze({
		platform: "darwin",
		sessionVisible: (runId: string | null): Promise<void> => ipcRenderer.invoke("trellis:session-visible", runId),
		previewNotification: (volume: number): Promise<void> => ipcRenderer.invoke("trellis:preview-notification", volume),
		refreshThermalState,
		onThermalStateChanged: (listener: (sample: DesktopThermalSample) => void) => {
			let current = true;
			const handler = (_event: IpcRendererEvent, sample: DesktopThermalSample) => listener(sample);
			ipcRenderer.on("trellis:thermal-state", handler);
			void refreshThermalState().then((sample) => {
				if (current) listener(sample);
			});
			return () => {
				current = false;
				ipcRenderer.removeListener("trellis:thermal-state", handler);
			};
		},
		onAccessibilitySupportChanged: (listener: (enabled: boolean) => void) => {
			const handler = (_event: IpcRendererEvent, enabled: boolean) => listener(enabled);
			ipcRenderer.on("trellis:accessibility-support", handler);
			void ipcRenderer.invoke("trellis:accessibility-ready");
			return () => ipcRenderer.removeListener("trellis:accessibility-support", handler);
		},
		writeClipboard: (text: string): Promise<void> => ipcRenderer.invoke("trellis:write-clipboard", text),
		chooseDirectory: (): Promise<string | null> => ipcRenderer.invoke("trellis:choose-directory"),
		status: (): Promise<DesktopStatus> => ipcRenderer.invoke("trellis:desktop-status"),
		serviceStatus: (): Promise<DesktopServiceStatus> => ipcRenderer.invoke("trellis:desktop-service-status"),
		updateStatus: (): Promise<DesktopUpdateStatus> => ipcRenderer.invoke("trellis:desktop-update-status"),
		setOpenAtLogin: (enabled: boolean): Promise<void> => ipcRenderer.invoke("trellis:set-open-at-login", enabled),
		run: (action: DesktopAction): Promise<void> => ipcRenderer.invoke("trellis:desktop-action", action),
		onBrowserCopyLink: (listener: () => void) => {
			const handler = () => listener();
			ipcRenderer.on("trellis:browser-copy-link", handler);
			return () => ipcRenderer.removeListener("trellis:browser-copy-link", handler);
		},
		onNavigate: (listener: (path: string) => void) => {
			const handler = (_event: IpcRendererEvent, path: string) => listener(path);
			ipcRenderer.on("trellis:navigate", handler);
			void ipcRenderer.invoke("trellis:navigation-ready");
			return () => ipcRenderer.removeListener("trellis:navigate", handler);
		},
	}),
);
