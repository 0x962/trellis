import type { MenuItemConstructorOptions } from "electron";

export type AppMenuActions = {
	openSettings: () => void;
	openWindow: () => void;
	openLogs: () => void;
	reconnectHost: () => void;
	quit: () => void;
};

// The Desktop section of the Settings page holds the app settings and the
// service actions. The menu keeps the standard macOS items, Open Trellis for
// a closed window, and the Help items. The Help items work when the Settings
// page cannot load because the host does not answer.
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
