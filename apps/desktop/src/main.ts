import { homedir } from "node:os";
import { join } from "node:path";
import { app, BrowserWindow, dialog, type IpcMainInvokeEvent, ipcMain, Menu, session, shell } from "electron";
import { appMenu } from "./appMenu/appMenu.ts";
import { chooseDataHome } from "./chooseDataHome/chooseDataHome.ts";
import { configureDesktopIdentity } from "./desktopIdentity/desktopIdentity.ts";
import { desktopPaths } from "./desktopPaths/desktopPaths.ts";
import {
	type DesktopAction,
	type DesktopStatus,
	parseDesktopAction,
	parseOpenAtLogin,
	updateSummary,
} from "./desktopSettings/desktopSettings.ts";
import { adoptHost, connectHost, type HostConnection } from "./host/host.ts";
import { installCli } from "./installCli/installCli.ts";
import { deepLinkPath, externalUrl, sameOrigin } from "./navigation/navigation.ts";
import { type PinnedRelease, pinResources } from "./pinnedResources/pinnedResources.ts";
import { prepareHome } from "./prepareHome/prepareHome.ts";
import { readConfiguredHome, readSelectedHome } from "./selectedHome/selectedHome.ts";
import { openServiceSettings, serviceCommand } from "./service/service.ts";
import { requireService, resumeLocalWork, stopLocalWork } from "./serviceActions/serviceActions.ts";
import { showUpdateStatus } from "./updateActions/updateActions.ts";
import { readUpdateStatus } from "./updateStatus/updateStatus.ts";
import { windowOptions } from "./windowOptions/windowOptions.ts";

let window: BrowserWindow | undefined;
let host: HostConnection;
let availableRelease: PinnedRelease | undefined;
let pendingPath = "/";
const desktopHome = () => process.env.TRELLIS_DESKTOP_HOME ?? readSelectedHome(app.getPath("userData"));
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
		...windowOptions(process.platform),
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

const chooseHome = (current = desktopHome()) =>
	chooseDataHome({
		current,
		userData: app.getPath("userData"),
		host,
		helper: paths().helper,
		resources: paths().hostRoot,
		relaunch: () => {
			app.relaunch();
			app.exit();
		},
	});

const connect = async () => {
	const hostRoot = paths().hostRoot;
	if (app.isPackaged) {
		if (process.env.TRELLIS_DESKTOP_HOME)
			throw new Error(
				"The registered service uses the Trellis application data directory. Use the desktop dev command for a scratch home.",
			);
		const prepared = await prepareHome(
			{ home: desktopHome() },
			{
				message: (options) => dialog.showMessageBox(options),
				useExisting: () => chooseHome(),
			},
		);
		if (!prepared) {
			app.quit();
			return;
		}
		availableRelease = await pinResources(hostRoot, app.getPath("userData"));
		await requireService(paths().helper, desktopHome());
		host = await adoptHost(desktopHome());
		const update = await readUpdateStatus(desktopHome(), availableRelease);
		if (!update.active) throw new Error("The background host has no active release.");
		await installCli({
			bin: join(homedir(), ".local/bin"),
			root: update.active.root,
			home: desktopHome(),
		});
		if (update.state === "blocked") await showUpdateStatus(desktopHome(), availableRelease);
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

// Only the Trellis window, showing a page of its own host, may call the main process.
const trustRenderer = (event: IpcMainInvokeEvent) => {
	if (
		!window ||
		event.sender !== window.webContents ||
		!event.senderFrame ||
		!sameOrigin(event.senderFrame.url, host.origin)
	)
		throw new Error("Untrusted desktop request.");
};

// The development app has no background service helper and no pinned package.
const requirePackaged = () => {
	if (!app.isPackaged) throw new Error("The development app uses TRELLIS_DESKTOP_HOME and has no background service.");
};

const desktopStatus = async (): Promise<DesktopStatus> => ({
	packaged: app.isPackaged,
	dataDirectory: desktopHome(),
	openAtLogin: app.getLoginItemSettings().openAtLogin,
	service: app.isPackaged ? (await serviceCommand(paths().helper, "status")).status : null,
	update: app.isPackaged ? updateSummary(await readUpdateStatus(desktopHome(), availableRelease!)) : null,
});

// Each action rejects with the message that the Settings page shows.
const desktopActions: Record<DesktopAction, () => Promise<unknown>> = {
	chooseDataDirectory: async () => {
		requirePackaged();
		await chooseHome();
	},
	showDataDirectory: () => shell.openPath(desktopHome()),
	openServiceSettings: async () => {
		requirePackaged();
		await openServiceSettings(paths().helper);
	},
	stopLocalWork: async () => {
		if (await stopLocalWork(host, desktopHome(), app.isPackaged ? paths().helper : undefined)) app.quit();
	},
	resumeLocalWork: () => resumeLocalWork(host),
	reconnectHost: async () => {
		await connect();
		await window?.loadURL(`${host.origin}${pendingPath}`);
	},
	quit: async () => app.quit(),
};

configureDesktopIdentity(app);
if (!app.requestSingleInstanceLock()) app.quit();
else {
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
				trustRenderer(event);
				const result = await dialog.showOpenDialog(window!, { properties: ["openDirectory"] });
				return result.canceled ? null : result.filePaths[0];
			});
			ipcMain.handle("trellis:desktop-status", (event) => {
				trustRenderer(event);
				return desktopStatus();
			});
			ipcMain.handle("trellis:set-open-at-login", (event, enabled: unknown) => {
				trustRenderer(event);
				requirePackaged();
				app.setLoginItemSettings({ openAtLogin: parseOpenAtLogin(enabled) });
			});
			ipcMain.handle("trellis:desktop-action", async (event, action: unknown) => {
				trustRenderer(event);
				await desktopActions[parseDesktopAction(action)]();
			});
			await connect();
			if (!host) return;
			Menu.setApplicationMenu(
				Menu.buildFromTemplate(
					appMenu({
						openSettings: () => void navigate("trellis://open/settings#desktop"),
						openWindow: () => void openWindow(),
						openLogs: () => void shell.openPath(desktopHome()),
						reconnectHost: () =>
							void desktopActions
								.reconnectHost()
								.catch((error: Error) => dialog.showErrorBox("Trellis host", error.message)),
						quit: () => app.quit(),
					}),
				),
			);
			await openWindow();
		})
		.catch(async (error: Error) => {
			const { response } = await dialog.showMessageBox({
				type: "error",
				message: "Trellis cannot start",
				detail: error.message,
				buttons: app.isPackaged ? ["Quit", "Choose data directory…"] : ["Quit"],
				defaultId: 0,
				cancelId: 0,
			});
			if (response === 1) {
				try {
					await chooseHome(readConfiguredHome(app.getPath("userData")));
				} catch (selectionError) {
					dialog.showErrorBox("The saved data directory needs attention", (selectionError as Error).message);
				}
			}
			app.quit();
		});
}
