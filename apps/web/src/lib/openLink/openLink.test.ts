import { describe, expect, test } from "bun:test";
import { linkOpenAction } from "./openLink";

describe("linkOpenAction", () => {
	test("holds an HTTPS page in the sheet of the desktop app", () => {
		expect(linkOpenAction("https://github.com/o/r/pull/7", true)).toBe("browser-sheet");
	});

	test("opens a tab in the browser build", () => {
		expect(linkOpenAction("https://github.com/o/r/pull/7", false)).toBe("new-tab");
	});

	test("opens a tab for an address the desktop browser refuses", () => {
		expect(linkOpenAction("http://example.com", true)).toBe("new-tab");
		expect(linkOpenAction("not a URL", true)).toBe("new-tab");
	});
});
