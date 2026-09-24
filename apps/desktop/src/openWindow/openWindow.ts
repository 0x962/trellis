import { BrowserWindow } from "electron";
import { showMaximizedWindow } from "../showMaximizedWindow/showMaximizedWindow.ts";
import { windowOptions } from "../windowOptions/windowOptions.ts";

export type OpenWindowOptions = {
	current: () => BrowserWindow | undefined;
	setCurrent: (window: BrowserWindow | undefined) => void;
	clearVisibleSession: () => void;
	finishProgress: (reveal: () => void) => Promise<void>;
	hostOrigin: () => string;
	initialPath: () => string;
	platform: string;
	preload: () => string;
	secure: (window: BrowserWindow) => void;
	startLoad: () => void;
};

export async function openWindow(options: OpenWindowOptions) {
	const current = options.current();
	if (current) {
		showMaximizedWindow(current);
		return;
	}
	const window = new BrowserWindow({
		width: 1280,
		height: 800,
		minWidth: 900,
		minHeight: 650,
		show: false,
		title: "Trellis",
		...windowOptions(options.platform),
		webPreferences: {
			preload: options.preload(),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
			webSecurity: true,
			webviewTag: true,
			partition: "persist:trellis",
		},
	});
	options.setCurrent(window);
	if (options.platform === "darwin") {
		window.on("restore", () => window.webContents.invalidate());
		window.on("show", () => window.webContents.invalidate());
	}
	options.startLoad();
	window.once("ready-to-show", () => {
		void options.finishProgress(() => showMaximizedWindow(window));
	});
	window.on("closed", () => {
		options.startLoad();
		options.setCurrent(undefined);
		options.clearVisibleSession();
	});
	window.webContents.on("did-start-loading", options.startLoad);
	options.secure(window);
	await window.loadURL(`${options.hostOrigin()}${options.initialPath()}`);
}
