import { expect, test } from "bun:test";
import type { UpdateStatus } from "../updateStatus/updateStatus.ts";
import {
	desktopActions,
	parseDesktopAction,
	parseOpenAtLogin,
	requireOpenedPath,
	updateSummary,
} from "./desktopSettings.ts";

test("the main process accepts only the named Settings actions from the renderer", () => {
	for (const action of desktopActions) expect(parseDesktopAction(action)).toBe(action);
	expect(() => parseDesktopAction("openPath")).toThrow("Unknown desktop action: openPath.");
	expect(() => parseDesktopAction({ action: "quit" })).toThrow("Unknown desktop action");
	expect(parseOpenAtLogin(true)).toBe(true);
	expect(parseOpenAtLogin(false)).toBe(false);
	expect(() => parseOpenAtLogin("true")).toThrow("Open at login takes true or false.");
});

test("a shell path error rejects the desktop action", () => {
	expect(() => requireOpenedPath("")).not.toThrow();
	expect(() => requireOpenedPath("The folder does not exist.")).toThrow("The folder does not exist.");
});

test("the update summary names the package, a short release, and the runtime protocol", () => {
	const available = {
		root: "/releases/a",
		manifest: { version: "1.2.3", id: "a".repeat(64), protocol: 3 },
	} as UpdateStatus["available"];
	const status: UpdateStatus = {
		state: "restart-required",
		available,
		active: null,
		runtimeProtocol: 3,
		detail: "The previous host still runs.",
	};
	expect(updateSummary(status)).toEqual({
		state: "restart-required",
		detail: "The previous host still runs.",
		version: "1.2.3",
		release: "aaaaaaaaaaaa",
		protocol: 3,
	});
});
