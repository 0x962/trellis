import { expect, test } from "bun:test";
import { windowOptions } from "./windowOptions.ts";

test("macOS centers native window controls in the application header", () => {
	expect(windowOptions("darwin")).toEqual({
		fullscreen: false,
		titleBarStyle: "hiddenInset",
		trafficLightPosition: { x: 16, y: 20 },
	});
});

test("other platforms keep the system title bar", () => {
	expect(windowOptions("linux")).toEqual({ fullscreen: false });
	expect(windowOptions("win32")).toEqual({ fullscreen: false });
});
