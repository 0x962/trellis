import type { BrowserWindowConstructorOptions } from "electron";

export function windowOptions(platform: string): BrowserWindowConstructorOptions {
	return platform === "darwin" ? { titleBarStyle: "hiddenInset", trafficLightPosition: { x: 16, y: 14 } } : {};
}
