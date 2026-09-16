import { expect, test } from "bun:test";
import type { MenuItemConstructorOptions } from "electron";
import { appMenu } from "./appMenu.ts";

const settingsPageItems = [
	"Update status",
	"Background service status",
	"Open Trellis at login",
	"Resume local work",
	"Choose data directory…",
	"Show data directory",
];

const submenu = (menu: MenuItemConstructorOptions[], label: string) =>
	menu.find((item) => item.label === label)!.submenu as MenuItemConstructorOptions[];
const names = (items: MenuItemConstructorOptions[]) =>
	items.filter((item) => item.type !== "separator").map((item) => item.label ?? item.role);
const click = (item: MenuItemConstructorOptions | undefined) => (item!.click as () => void)();

test("the application menu opens Settings and keeps the stop action available for package upgrades", () => {
	const calls: string[] = [];
	const menu = appMenu({
		openSettings: () => calls.push("settings"),
		openWindow: () => calls.push("window"),
		openLogs: () => calls.push("logs"),
		reconnectHost: () => calls.push("reconnect"),
		stopLocalWork: () => calls.push("stop"),
		quit: () => calls.push("quit"),
	});
	const trellis = submenu(menu, "Trellis");
	expect(names(trellis)).toEqual([
		"about",
		"Settings…",
		"hide",
		"hideOthers",
		"unhide",
		"Stop local work and background service",
		"Quit Trellis (keep agents running)",
	]);
	expect(names(submenu(menu, "File"))).toEqual(["Open Trellis", "close"]);
	expect(names(submenu(menu, "Help"))).toEqual(["Open local logs", "Reconnect host"]);
	const settings = trellis.find((item) => item.label === "Settings…");
	expect(settings?.accelerator).toBe("Cmd+,");
	expect(trellis.find((item) => item.label === "Quit Trellis (keep agents running)")?.accelerator).toBe("Cmd+Q");
	const labels = menu.flatMap((item) => names(Array.isArray(item.submenu) ? item.submenu : []));
	for (const label of settingsPageItems) expect(labels).not.toContain(label);
	click(settings);
	click(submenu(menu, "File")[0]);
	click(submenu(menu, "Help")[0]);
	click(submenu(menu, "Help")[1]);
	click(trellis.find((item) => item.label === "Stop local work and background service"));
	click(trellis.at(-1));
	expect(calls).toEqual(["settings", "window", "logs", "reconnect", "stop", "quit"]);
});
