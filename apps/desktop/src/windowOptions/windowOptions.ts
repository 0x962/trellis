import type { BrowserWindowConstructorOptions } from "electron";

export function windowOptions(platform: string): BrowserWindowConstructorOptions {
	return {
		fullscreen: false,
		...(platform === "darwin" ? { titleBarStyle: "hiddenInset" as const, trafficLightPosition: { x: 16, y: 20 } } : {}),
	};
}
