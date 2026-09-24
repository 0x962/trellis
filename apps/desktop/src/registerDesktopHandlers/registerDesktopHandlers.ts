import { app, type BrowserWindow, clipboard, dialog, type IpcMainInvokeEvent, ipcMain, powerMonitor } from "electron";
import {
	type DesktopAction,
	type DesktopServiceStatus,
	type DesktopStatus,
	type DesktopUpdateStatus,
	parseDesktopAction,
	parseOpenAtLogin,
} from "../desktopSettings/desktopSettings.ts";

export function registerDesktopHandlers(options: {
	trust: (event: IpcMainInvokeEvent) => void;
	window: () => BrowserWindow | undefined;
	setVisible: (runId: string | null) => void;
	play: (volume: number) => Promise<void>;
	rendererReady: () => void;
	status: () => DesktopStatus;
	serviceStatus: () => Promise<DesktopServiceStatus>;
	updateStatus: () => Promise<DesktopUpdateStatus>;
	hostOrigin: () => string;
	requirePackaged: () => void;
	action: (action: DesktopAction) => Promise<unknown>;
}) {
	ipcMain.handle("trellis:session-visible", (event, runId: unknown) => {
		options.trust(event);
		if (runId !== null && typeof runId !== "string") throw new Error("Invalid session identifier.");
		options.setVisible(runId);
	});
	ipcMain.handle("trellis:preview-notification", (event, volume: unknown) => {
		options.trust(event);
		if (typeof volume !== "number" || !Number.isFinite(volume) || volume < 0 || volume > 100)
			throw new Error("Invalid volume.");
		return options.play(volume);
	});
	ipcMain.handle("trellis:choose-directory", async (event) => {
		options.trust(event);
		const result = await dialog.showOpenDialog(options.window()!, { properties: ["openDirectory"] });
		return result.canceled ? null : result.filePaths[0];
	});
	// The renderer session refuses every web permission, so
	// `navigator.clipboard.writeText` rejects in the window. A copy goes
	// through the main process instead.
	ipcMain.handle("trellis:write-clipboard", (event, text: unknown) => {
		options.trust(event);
		if (typeof text !== "string") throw new Error("Invalid clipboard text.");
		clipboard.writeText(text);
	});
	ipcMain.handle("trellis:navigation-ready", (event) => {
		options.trust(event);
		options.rendererReady();
	});
	ipcMain.handle("trellis:accessibility-ready", (event) => {
		options.trust(event);
		event.sender.send("trellis:accessibility-support", app.isAccessibilitySupportEnabled());
	});
	// The web query asks for the current thermal state with each server sample.
	// powerMonitor also sends each state change on the same channel.
	ipcMain.handle("trellis:thermal-ready", (event) => {
		options.trust(event);
		return {
			state: powerMonitor.getCurrentThermalState(),
			sampledAt: new Date().toISOString(),
			hostOrigin: options.hostOrigin(),
		};
	});
	ipcMain.handle("trellis:desktop-status", (event) => {
		options.trust(event);
		return options.status();
	});
	ipcMain.handle("trellis:desktop-service-status", (event) => {
		options.trust(event);
		return options.serviceStatus();
	});
	ipcMain.handle("trellis:desktop-update-status", (event) => {
		options.trust(event);
		return options.updateStatus();
	});
	ipcMain.handle("trellis:set-open-at-login", (event, enabled: unknown) => {
		options.trust(event);
		options.requirePackaged();
		app.setLoginItemSettings({ openAtLogin: parseOpenAtLogin(enabled) });
	});
	ipcMain.handle("trellis:desktop-action", async (event, action: unknown) => {
		options.trust(event);
		await options.action(parseDesktopAction(action));
	});
}
