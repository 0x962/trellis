import { describe, expect, test } from "bun:test";
import { linkOpenAction } from "./openLink";

describe("linkOpenAction", () => {
	test("holds an HTTPS page in the sheet of the desktop app", () => {
		expect(linkOpenAction("https://github.com/o/r/pull/7", true)).toBe("browser-sheet");
	});

	test("opens a tab in the browser build", () => {
		expect(linkOpenAction("https://github.com/o/r/pull/7", false)).toBe("new-tab");
	});

	test("holds HTTP in the slideout and sends Command-click to the system browser", () => {
		expect(linkOpenAction("http://example.com", true)).toBe("browser-sheet");
		for (const url of ["http://example.com", "https://example.com"]) {
			expect(linkOpenAction(url, true, { metaKey: true })).toBe("new-tab");
		}
	});
	test.each(["not a URL", "trellis://page/01M3GHKCN2JY8QMTZ17TP3RHYG", "javascript:alert(1)"])("refuses %s", (url) => {
		expect(() => linkOpenAction(url, true, { metaKey: true })).toThrow("unsupported or invalid");
	});
});
