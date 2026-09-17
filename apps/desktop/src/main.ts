import { homedir } from "node:os";
import { join } from "node:path";
import { app, BrowserWindow, dialog, type IpcMainInvokeEvent, ipcMain, Menu, session, shell } from "electron";
import { activateHostRelease } from "./activateHostRelease/activateHostRelease.ts";
import { appMenu } from "./appMenu/appMenu.ts";
import { chooseDataHome } from "./chooseDataHome/chooseDataHome.ts";
import { configureDesktopIdentity } from "./desktopIdentity/desktopIdentity.ts";
import { desktopPaths } from "./desktopPaths/desktopPaths.ts";
import {
	type DesktopAction,
	type DesktopServiceStatus,
	type DesktopStatus,
	type DesktopUpdateStatus,
	parseDesktopAction,
	parseOpenAtLogin,
	requireOpenedPath,
	updateSummary,
} from "./desktopSettings/desktopSettings.ts";
import { connectHost, type HostConnection } from "./host/host.ts";
import { hostRequest } from "./hostRequest/hostRequest.ts";
import { installCli } from "./installCli/installCli.ts";
import { deepLinkPath, externalUrl, rendererPath, sameOrigin } from "./navigation/navigation.ts";
import { type PinnedRelease, pinResources } from "./pinnedResources/pinnedResources.ts";
import { prepareHome } from "./prepareHome/prepareHome.ts";
import { createRendererNavigation } from "./rendererNavigation";
import { restartMenuItem } from "./restartMenuItem/index.ts";
import { readSelectedHome } from "./selectedHome/selectedHome.ts";
import { openServiceSettings, serviceCommand } from "./service/service.ts";
import { requireService, stopLocalWork } from "./serviceActions/serviceActions.ts";
import { showMaximizedWindow } from "./showMaximizedWindow/showMaximizedWindow.ts";
import { showStartupError } from "./showStartupError/index.ts";
import { startupProgress } from "./startupProgress/index.ts";
import { showUpdateStatus } from "./updateActions/updateActions.ts";
import { readUpdateStatus } from "./updateStatus/updateStatus.ts";
import { windowOptions } from "./windowOptions/windowOptions.ts";

let window: BrowserWindow | undefined;
let host: HostConnection;
let availableRelease: PinnedRelease | undefined;
const rendererNavigation = createRendererNavigation((path) => window?.webContents.send("trellis:navigate", path));
const progress = startupProgress(join(app.getAppPath(), "dist/startup.html"));
// readSelectedHome throws when the selection file names no directory, so the
// startup dialog can name only a directory that this function already returned.
let lastHome: string | undefined;
const desktopHome = () => {
	lastHome = process.env.TRELLIS_DESKTOP_HOME ?? readSelectedHome(app.getPath("userData"));
	return lastHome;
};
const paths = () => desktopPaths(app.getAppPath(), process.resourcesPath, app.isPackaged);
const developmentHostOptions = () => ({
	home: desktopHome(),
	executable: process.env.TRELLIS_BUN_BIN ?? "bun",
	entry: join(paths().hostRoot, "apps/server/src/index.ts"),
	webDist: join(paths().hostRoot, "apps/web/dist"),
});

const openWindow = async () => {
	if (window) {
		showMaximizedWindow(window);
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
	const createdWindow = window;
	rendererNavigation.startLoad();
	window.once("ready-to-show", () => {
		void progress.finish(() => showMaximizedWindow(createdWindow));
	});
	window.on("closed", () => {
		rendererNavigation.startLoad();
		window = undefined;
	});
	window.webContents.on("did-start-loading", rendererNavigation.startLoad);
	window.webContents.on("will-navigate", (event, url) => {
		if (!sameOrigin(url, host.origin)) event.preventDefault();
	});
	window.webContents.on("will-attach-webview", (event) => event.preventDefault());
	window.webContents.setWindowOpenHandler(({ url }) => {
		if (externalUrl(url)) void shell.openExternal(url);
		return { action: "deny" };
	});
	await window.loadURL(`${host.origin}${rendererNavigation.initialPath()}`);
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

const connect = async (report: (stage: string) => Promise<void> = async () => {}) => {
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
		await report("Check installed app");
		availableRelease = await pinResources(hostRoot, app.getPath("userData"));
		const service = {
			ensureService: () => requireService(paths().helper, desktopHome()),
			register: () => requireService(paths().helper, desktopHome()),
		};
		const connectedHost = await activateHostRelease(desktopHome(), paths().helper, availableRelease, service, report);
		const update = await readUpdateStatus(desktopHome(), availableRelease);
		if (!update.active) throw new Error("The background host has no active release.");
		await installCli({
			bin: join(homedir(), ".local/bin"),
			root: update.active.root,
			home: desktopHome(),
		});
		if (update.state === "blocked") await showUpdateStatus(desktopHome(), availableRelease);
		host = connectedHost;
		return;
	}
	await report("Start background host");
	host = await connectHost(developmentHostOptions());
};

const navigate = async (url: string) => {
	const path = deepLinkPath(url);
	if (!path) return;
	if (window) {
		window.show();
		window.focus();
		rendererNavigation.navigate(path);
		return;
	}
	rendererNavigation.navigate(path);
	if (host) await openWindow();
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

const desktopStatus = (): DesktopStatus => ({
	packaged: app.isPackaged,
	dataDirectory: desktopHome(),
	openAtLogin: app.getLoginItemSettings().openAtLogin,
});

const desktopServiceStatus = async (): Promise<DesktopServiceStatus> =>
	app.isPackaged ? (await serviceCommand(paths().helper, "status")).status : null;

const desktopUpdateStatus = async (): Promise<DesktopUpdateStatus> =>
	app.isPackaged ? updateSummary(await readUpdateStatus(desktopHome(), availableRelease!)) : null;

const openPath = async (path: string) => {
	const error = await shell.openPath(path);
	requireOpenedPath(error);
};

// Each action rejects with the message that the Settings page shows.
const desktopActions: Record<DesktopAction, () => Promise<unknown>> = {
	chooseDataDirectory: async () => {
		requirePackaged();
		await chooseHome();
	},
	showDataDirectory: () => openPath(desktopHome()),
	openServiceSettings: async () => {
		requirePackaged();
		await openServiceSettings(paths().helper);
	},
	stopLocalWork: async () => {
		if (await stopLocalWork(host, desktopHome(), app.isPackaged ? paths().helper : undefined)) app.quit();
	},
	reconnectHost: async () => {
		const path = window ? rendererPath(window.webContents.getURL()) : "/";
		await connect();
		await window?.loadURL(`${host.origin}${path}`);
	},
	quit: async () => app.quit(),
};

const menuAction = (name: DesktopAction, title: string) => () =>
	void desktopActions[name]().catch((error: Error) => dialog.showErrorBox(title, error.message));

configureDesktopIdentity(app);
if (!app.requestSingleInstanceLock()) app.quit();
else {
	app.setAsDefaultProtocolClient("trellis");
	app.on("window-all-closed", () => {});
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
			await progress.show("Prepare Trellis");
			const rendererSession = session.fromPartition("persist:trellis");
			rendererSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
			rendererSession.setPermissionCheckHandler(() => false);
			rendererSession.webRequest.onBeforeSendHeaders((details, callback) => {
				if (host && window && details.webContentsId === window.webContents.id && hostRequest(details.url, host.origin))
					details.requestHeaders.Authorization = `Bearer ${host.token}`;
				else delete details.requestHeaders.Authorization;
				callback({ requestHeaders: details.requestHeaders });
			});
			ipcMain.handle("trellis:choose-directory", async (event) => {
				trustRenderer(event);
				const result = await dialog.showOpenDialog(window!, { properties: ["openDirectory"] });
				return result.canceled ? null : result.filePaths[0];
			});
			ipcMain.handle("trellis:navigation-ready", (event) => {
				trustRenderer(event);
				rendererNavigation.rendererReady();
			});
			ipcMain.handle("trellis:desktop-status", (event) => {
				trustRenderer(event);
				return desktopStatus();
			});
			ipcMain.handle("trellis:desktop-service-status", (event) => {
				trustRenderer(event);
				return desktopServiceStatus();
			});
			ipcMain.handle("trellis:desktop-update-status", (event) => {
				trustRenderer(event);
				return desktopUpdateStatus();
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
			await connect(progress.show);
			if (!host) return;
			Menu.setApplicationMenu(
				Menu.buildFromTemplate(
					appMenu({
						openSettings: () => void navigate("trellis://open/settings#desktop"),
						openWindow: () => void openWindow(),
						openLogs: menuAction("showDataDirectory", "Local logs"),
						reconnectHost: menuAction("reconnectHost", "Trellis host"),
						stopLocalWork: menuAction("stopLocalWork", "Local work"),
						restart: restartMenuItem(app),
						quit: menuAction("quit", "Quit Trellis"),
					}),
				),
			);
			await progress.show("Open Trellis");
			await openWindow();
		})
		.catch(async (error: Error) => {
			const step = progress.step();
			await progress.close();
			await showStartupError(
				{ message: (options) => dialog.showMessageBox(options), quit: () => app.quit() },
				{ error, step, home: lastHome },
			);
		});
}
