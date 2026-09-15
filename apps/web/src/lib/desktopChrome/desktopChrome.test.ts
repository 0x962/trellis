import { expect, test } from "bun:test";
import { hasMacDesktopChrome } from "./desktopChrome.ts";

test("only the macOS desktop bridge enables the application title strip", () => {
	expect(hasMacDesktopChrome({ platform: "darwin" })).toBe(true);
	expect(hasMacDesktopChrome(undefined)).toBe(false);
	expect(hasMacDesktopChrome({ platform: "win32" })).toBe(false);
});
