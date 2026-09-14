import { join, resolve } from "node:path";
import { app, BrowserWindow, dialog, ipcMain, Menu, session, shell } from "electron";
import { connectHost, type HostConnection } from "./host/host.ts";
import { deepLinkPath, externalUrl, sameOrigin } from "./navigation/navigation.ts";

let window: BrowserWindow | undefined;
let host: HostConnection;
let pendingPath = "/";
const desktopHome = () => process.env.TRELLIS_DESKTOP_HOME ?? join(app.getPath("userData"), "host");
const root = () => (app.isPackaged ? join(process.resourcesPath, "host") : resolve(__dirname, "../../.."));

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
			preload: join(__dirname, "preload.cjs"),
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
	const hostRoot = root();
	host = await connectHost({
		home: desktopHome(),
		executable: app.isPackaged ? join(hostRoot, "bin/bun") : (process.env.TRELLIS_BUN_BIN ?? "bun"),
		entry: join(hostRoot, "apps/server/src/index.ts"),
		webDist: join(hostRoot, "apps/web/dist"),
		env: app.isPackaged
			? {
					PATH: `${join(hostRoot, "bin")}:${process.env.PATH ?? "/usr/bin:/bin"}`,
					TRELLIS_RUNTIME_NODE: join(hostRoot, "bin/node"),
					TRELLIS_RUNTIME_SCRIPT: join(hostRoot, "apps/runtime/dist/index.js"),
				}
			: undefined,
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
