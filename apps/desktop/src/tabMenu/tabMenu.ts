import type { MenuItemConstructorOptions } from "electron";

export type TabCommand = "new" | "close" | "reopen" | "next" | "previous";

const item = (
	label: string,
	accelerator: string,
	command: TabCommand,
	send: (command: TabCommand) => void,
): MenuItemConstructorOptions => ({
	label,
	accelerator,
	click: () => send(command),
});

export const tabMenu = (send: (command: TabCommand) => void): MenuItemConstructorOptions[] => [
	item("New tab", "CommandOrControl+T", "new", send),
	item("Close tab", "CommandOrControl+W", "close", send),
	item("Reopen closed tab", "CommandOrControl+Shift+T", "reopen", send),
	item("Next tab", "Control+Tab", "next", send),
	item("Previous tab", "Control+Shift+Tab", "previous", send),
];
