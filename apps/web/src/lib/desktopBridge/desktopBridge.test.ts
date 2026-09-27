import { expect, test } from "bun:test";
import type { DesktopBridgeWindow } from "./desktopBridge";
import { readDesktopBridge } from "./desktopBridge";

const bridgeWindow = (trellisDesktop?: DesktopBridgeWindow["trellisDesktop"]) =>
	({ trellisDesktop }) as DesktopBridgeWindow;

test("reads the bridge that the desktop preload exposes", () => {
	const bridge = { platform: "darwin" };

	expect(readDesktopBridge(bridgeWindow(bridge))).toBe(bridge);
});

test("returns no bridge for a browser window", () => {
	expect(readDesktopBridge(bridgeWindow())).toBeUndefined();
});
