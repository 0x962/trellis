import type { MenuItemConstructorOptions } from "electron";

export type AppMenuActions = {
	openSettings: () => void;
	openWindow: () => void;
	openLogs: () => void;
	reconnectHost: () => void;
	stopLocalWork: () => void;
	restart: MenuItemConstructorOptions;
	quit: () => void;
};

// The Help items work when the host cannot load the Settings page. Stop local
// work also stays here because an older active host can serve an older page
// without the Desktop section after an application upgrade.
export const appMenu = (actions: AppMenuActions): MenuItemConstructorOptions[] => [
	{
		label: "Trellis",
		submenu: [
			{ role: "about" },
			{ type: "separator" },
			{ label: "Settings…", accelerator: "Cmd+,", click: actions.openSettings },
			{ type: "separator" },
			{ role: "hide" },
			{ role: "hideOthers" },
			{ role: "unhide" },
			{ type: "separator" },
			{ label: "Stop local work and background service", click: actions.stopLocalWork },
			actions.restart,
			{ label: "Quit Trellis (keep agents running)", accelerator: "Cmd+Q", click: actions.quit },
		],
	},
	{
		label: "File",
		submenu: [{ label: "Open Trellis", accelerator: "Cmd+N", click: actions.openWindow }, { role: "close" }],
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
			{ label: "Open local logs", click: actions.openLogs },
			{ label: "Reconnect host", click: actions.reconnectHost },
		],
	},
];
