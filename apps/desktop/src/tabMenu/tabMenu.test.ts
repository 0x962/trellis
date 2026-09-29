import { expect, test } from "bun:test";
import type { BrowserWindow, KeyboardEvent, MenuItem } from "electron";
import { tabMenu } from "./tabMenu";

test("native accelerators dispatch one tab command to the owning window renderer", () => {
	const calls: unknown[][] = [];
	const window = { webContents: { send: (...args: unknown[]) => calls.push(args) } } as unknown as BrowserWindow;
	const items = tabMenu((command, target) => {
		expect(target).toBe(window);
		window.webContents.send("trellis:tab-command", command);
	});
	expect(items.map((item) => item.accelerator)).toEqual([
		"CommandOrControl+T",
		"CommandOrControl+W",
		"CommandOrControl+Shift+T",
		"Control+Tab",
		"Control+Shift+Tab",
	]);
	for (const item of items) item.click!({} as MenuItem, window, {} as KeyboardEvent);
	expect(calls).toEqual(
		["new", "close", "reopen", "next", "previous"].map((command) => ["trellis:tab-command", command]),
	);
});
