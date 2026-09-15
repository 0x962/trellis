import { expect, test } from "bun:test";
import { windowOptions } from "./windowOptions.ts";

test("macOS keeps native window controls inside the application title strip", () => {
	expect(windowOptions("darwin")).toEqual({ titleBarStyle: "hiddenInset", trafficLightPosition: { x: 16, y: 14 } });
});

test("other platforms keep the system title bar", () => {
	expect(windowOptions("linux")).toEqual({});
	expect(windowOptions("win32")).toEqual({});
});
