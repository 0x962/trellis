import { describe, expect, test } from "bun:test";
import { LINK_BROWSER_PARTITION, LINK_BROWSER_WEB_PREFERENCES, linkLoadError, linkUrlError } from "./LinkBrowserSheet";

describe("LinkBrowserSheet", () => {
	test("uses the partition and web preferences that the desktop handler enforces", () => {
		expect(LINK_BROWSER_PARTITION).toBe("persist:trellis-link-browser");
		expect(LINK_BROWSER_WEB_PREFERENCES).toBe("nodeIntegration=no,sandbox=yes");
	});

	test("prints a failure of the main page", () => {
		expect(linkLoadError({ errorCode: -105, errorDescription: "NAME_NOT_RESOLVED", isMainFrame: true })).toBe(
			"NAME_NOT_RESOLVED",
		);
	});

	test("ignores a canceled load and a failed subframe", () => {
		expect(linkLoadError({ errorCode: -3, errorDescription: "ABORTED", isMainFrame: true })).toBeNull();
		expect(linkLoadError({ errorCode: -105, errorDescription: "NAME_NOT_RESOLVED", isMainFrame: false })).toBeNull();
	});

	test("refuses a link outside HTTPS before it creates a webview", () => {
		expect(linkUrlError("https://example.com")).toBeNull();
		expect(linkUrlError("http://example.com")).toBe("Trellis opens only HTTPS links.");
	});
});
