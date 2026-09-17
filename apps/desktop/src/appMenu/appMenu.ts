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

// The native menu works when the renderer cannot load. Keep reconnectHost,
// stopLocalWork, and quit here so a renderer failure cannot hide these actions.
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
			actions.restart,
			{ type: "separator" },
			{ label: "Quit Trellis Completely", click: actions.stopLocalWork },
			{ label: "Quit Trellis", accelerator: "Cmd+Q", click: actions.quit },
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
