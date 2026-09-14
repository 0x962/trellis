import { join } from "node:path";
import { app, BrowserWindow, dialog, ipcMain, Menu, session, shell } from "electron";
import { desktopPaths } from "./desktopPaths/desktopPaths.ts";
import { adoptHost, connectHost, type HostConnection } from "./host/host.ts";
import { deepLinkPath, externalUrl, sameOrigin } from "./navigation/navigation.ts";
import { requireService, resumeLocalWork, showServiceStatus, stopLocalWork } from "./serviceActions/serviceActions.ts";

let window: BrowserWindow | undefined;
let host: HostConnection;
let pendingPath = "/";
const desktopHome = () => process.env.TRELLIS_DESKTOP_HOME ?? join(app.getPath("userData"), "host");
const paths = () => desktopPaths(app.getAppPath(), process.resourcesPath, app.isPackaged);

const openWindow = async () => {
	if (window) {
		window.show();
		window.focus();
		return;
	}
	window = new BrowserWindow({
		width: 1280,
		height: 800,
		minWidth: 900,
		minHeight: 650,
		show: false,
		title: "Trellis",
		webPreferences: {
			preload: paths().preload,
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
			webSecurity: true,
			partition: "persist:trellis",
		},
	});
	window.once("ready-to-show", () => window?.show());
	window.on("closed", () => {
		window = undefined;
	});
	window.webContents.on("will-navigate", (event, url) => {
		if (!sameOrigin(url, host.origin)) event.preventDefault();
	});
	window.webContents.on("will-attach-webview", (event) => event.preventDefault());
	window.webContents.setWindowOpenHandler(({ url }) => {
		if (externalUrl(url)) void shell.openExternal(url);
		return { action: "deny" };
	});
	await window.loadURL(`${host.origin}${pendingPath}`);
};

const connect = async () => {
	const hostRoot = paths().hostRoot;
	if (app.isPackaged) {
		if (process.env.TRELLIS_DESKTOP_HOME)
			throw new Error(
				"The registered service uses the Trellis application data directory. Use the desktop dev command for a scratch home.",
			);
		await requireService(paths().helper, desktopHome());
		host = await adoptHost(desktopHome());
		return;
	}
	host = await connectHost({
		home: desktopHome(),
		executable: process.env.TRELLIS_BUN_BIN ?? "bun",
		entry: join(hostRoot, "apps/server/src/index.ts"),
		webDist: join(hostRoot, "apps/web/dist"),
	});
};

const navigate = async (url: string) => {
	const path = deepLinkPath(url);
	if (!path) return;
	pendingPath = path;
	if (host) {
		await openWindow();
		await window!.loadURL(`${host.origin}${path}`);
	}
};

if (!app.requestSingleInstanceLock()) app.quit();
else {
	app.setName("Trellis");
	app.setAsDefaultProtocolClient("trellis");
	app.on("open-url", (event, url) => {
		event.preventDefault();
		void navigate(url);
	});
	app.on("second-instance", (_event, argv) => {
		const url = argv.find((arg) => arg.startsWith("trellis:"));
		if (url) void navigate(url);
		else if (host) void openWindow();
	});
	app.on("activate", () => {
		if (host) void openWindow();
	});
	void app
		.whenReady()
		.then(async () => {
			const rendererSession = session.fromPartition("persist:trellis");
			rendererSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
			rendererSession.setPermissionCheckHandler(() => false);
			rendererSession.webRequest.onBeforeSendHeaders((details, callback) => {
				if (host && window && details.webContentsId === window.webContents.id && sameOrigin(details.url, host.origin))
					details.requestHeaders.Authorization = `Bearer ${host.token}`;
				else delete details.requestHeaders.Authorization;
				callback({ requestHeaders: details.requestHeaders });
			});
			ipcMain.handle("trellis:choose-directory", async (event) => {
				if (
					!window ||
					event.sender !== window.webContents ||
					!event.senderFrame ||
					!sameOrigin(event.senderFrame.url, host.origin)
				)
					throw new Error("Untrusted desktop request.");
				const result = await dialog.showOpenDialog(window, { properties: ["openDirectory"] });
				return result.canceled ? null : result.filePaths[0];
			});
			Menu.setApplicationMenu(
				Menu.buildFromTemplate([
					{
						label: "Trellis",
						submenu: [
							{ role: "about" },
							{
								label: "Background service status",
								enabled: app.isPackaged,
								click: () => void showServiceStatus(paths().helper),
							},
							{
								label: "Open Trellis at login",
								type: "checkbox",
								enabled: app.isPackaged,
								checked: app.getLoginItemSettings().openAtLogin,
								click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
							},
							{
								label: "Stop local work and background service",
								click: () =>
									void stopLocalWork(host, desktopHome(), app.isPackaged ? paths().helper : undefined)
										.then((stopped) => {
											if (stopped) app.quit();
										})
										.catch((error: Error) => dialog.showErrorBox("Local work did not stop", error.message)),
							},
							{
								label: "Resume local work",
								click: () =>
									void resumeLocalWork(host).catch((error: Error) =>
										dialog.showErrorBox("Local work stays paused", error.message),
									),
							},
							{ type: "separator" },
							{ role: "hide" },
							{ role: "hideOthers" },
							{ role: "unhide" },
							{ type: "separator" },
							{ label: "Quit Trellis (keep agents running)", accelerator: "Cmd+Q", click: () => app.quit() },
						],
					},
					{
						label: "File",
						submenu: [
							{ label: "Open Trellis", accelerator: "Cmd+N", click: () => void openWindow() },
							{ role: "close" },
						],
					},
					{ role: "editMenu" },
					{
						label: "View",
						submenu: [
							{ role: "reload" },
							{ role: "toggleDevTools" },
							{ type: "separator" },
							{ role: "resetZoom" },
							{ role: "zoomIn" },
							{ role: "zoomOut" },
							{ type: "separator" },
							{ role: "togglefullscreen" },
						],
					},
					{ role: "windowMenu" },
					{
						label: "Help",
						submenu: [
							{ label: "Open local logs", click: () => void shell.openPath(desktopHome()) },
							{
								label: "Reconnect host",
								click: () =>
									void connect()
										.then(() => window?.loadURL(`${host.origin}${pendingPath}`))
										.catch((error: Error) => dialog.showErrorBox("Trellis host", error.message)),
							},
						],
					},
				]),
			);
			await connect();
			await openWindow();
		})
		.catch((error: Error) => {
			dialog.showErrorBox("Trellis cannot start", error.message);
			app.quit();
		});
}
