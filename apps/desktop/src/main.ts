import { homedir } from "node:os";
import { join } from "node:path";
import { app, type BrowserWindow, dialog, type IpcMainInvokeEvent, Menu, powerMonitor, shell } from "electron";
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
	requireOpenedPath,
	type ThermalState,
	updateSummary,
} from "./desktopSettings/desktopSettings.ts";
import { askForFullDiskAccess, hasFullDiskAccess } from "./fullDiskAccess/fullDiskAccess.ts";
import { connectHost, type HostConnection } from "./host/host.ts";
import { installCli } from "./installCli/installCli.ts";
import { deepLinkPath, rendererPath, sameOrigin } from "./navigation/navigation.ts";
import { openWindow as openDesktopWindow } from "./openWindow";
import { type PinnedRelease, pinResources } from "./pinnedResources/pinnedResources.ts";
import { prepareHome } from "./prepareHome/prepareHome.ts";
import { registerDesktopHandlers } from "./registerDesktopHandlers/registerDesktopHandlers.ts";
import { createRendererNavigation } from "./rendererNavigation";
import { restartHost } from "./restartHost/index.ts";
import { restartMenuItem } from "./restartMenuItem/index.ts";
import { secureRenderer } from "./secureRenderer/secureRenderer.ts";
import { readSelectedHome } from "./selectedHome/selectedHome.ts";
import { openServiceSettings, serviceCommand } from "./service/service.ts";
import { requireService, stopLocalWork } from "./serviceActions/serviceActions.ts";
import { sessionNotifications } from "./sessionNotifications/sessionNotifications.ts";
import { showStartupError } from "./showStartupError/index.ts";
import { startupProgress } from "./startupProgress/index.ts";
import { showUpdateStatus } from "./updateActions/updateActions.ts";
import { readUpdateStatus } from "./updateStatus/updateStatus.ts";

configureDesktopIdentity(app);

let window: BrowserWindow | undefined;
let host: HostConnection;
let visibleSession: string | null = null;
const notifications = sessionNotifications({
	directory: join(app.getPath("userData"), "sounds"),
	isVisible: (runId) => Boolean(window?.isFocused() && !window.isMinimized() && visibleSession === runId),
	navigate: (path) => navigate(`trellis://open${path}`),
});
app.on("before-quit", () => notifications.stop());
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
const openWindow = () =>
	openDesktopWindow({
		current: () => window,
		setCurrent: (value) => {
			window = value;
		},
		clearVisibleSession: () => {
			visibleSession = null;
		},
		finishProgress: progress.finish,
		hostOrigin: () => host.origin,
		initialPath: rendererNavigation.initialPath,
		platform: process.platform,
		preload: () => paths().preload,
		secure: (value) => secureRenderer(value, () => host),
		startLoad: rendererNavigation.startLoad,
	});
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
		notifications.connect(host);
		return;
	}
	await report("Start background host");
	host = await connectHost(developmentHostOptions());
	notifications.connect(host);
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

if (process.platform === "darwin") app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
app.commandLine.appendSwitch("max-active-webgl-contexts", "256");
if (!app.requestSingleInstanceLock()) app.quit();
else {
	app.setAsDefaultProtocolClient("trellis");
	app.on("window-all-closed", () => {});
	app.on("accessibility-support-changed", (_event, enabled) => {
		window?.webContents.send("trellis:accessibility-support", enabled);
	});
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

			registerDesktopHandlers({
				trust: trustRenderer,
				window: () => window,
				setVisible: (id) => {
					visibleSession = id;
				},
				play: notifications.play,
				rendererReady: rendererNavigation.rendererReady,
				status: desktopStatus,
				serviceStatus: desktopServiceStatus,
				updateStatus: desktopUpdateStatus,
				hostOrigin: () => host.origin,
				requirePackaged,
				action: (action) => desktopActions[action](),
			});
			await connect(progress.show);
			if (!host) return;
			const sendThermalState = (details: { state: ThermalState }) => {
				window?.webContents.send("trellis:thermal-state", {
					state: details.state,
					sampledAt: new Date().toISOString(),
					hostOrigin: host.origin,
				});
			};
			powerMonitor.on("thermal-state-change", sendThermalState);
			app.once("before-quit", () => powerMonitor.removeListener("thermal-state-change", sendThermalState));
			Menu.setApplicationMenu(
				Menu.buildFromTemplate(
					appMenu({
						openSettings: () => void navigate("trellis://open/settings#desktop"),
						openWindow: () => void openWindow(),
						openLogs: menuAction("showDataDirectory", "Local logs"),
						reconnectHost: menuAction("reconnectHost", "Trellis host"),
						stopLocalWork: menuAction("stopLocalWork", "Local work"),
						restart: restartMenuItem(
							app,
							app.isPackaged
								? undefined
								: {
										restart: async () => {
											host = await restartHost(developmentHostOptions());
											notifications.connect(host);
										},
										showError: (error) => dialog.showErrorBox("Trellis did not restart", error.message),
									},
						),
						quit: menuAction("quit", "Quit Trellis"),
					}),
				),
			);
			await progress.show("Open Trellis");
			await openWindow();
			if (app.isPackaged)
				await askForFullDiskAccess({
					granted: () => hasFullDiskAccess(homedir()),
					declinedFile: join(app.getPath("userData"), "full-disk-access-declined"),
					message: (options) => dialog.showMessageBox(options),
					openSettings: (url) => shell.openExternal(url),
				});
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
