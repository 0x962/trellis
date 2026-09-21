import { describe, expect, test } from "bun:test";
import { linkLoadError, linkUrlError } from "./linkError";

describe("linkError", () => {
	test("prints a failure of the main page", () => {
		expect(linkLoadError({ errorCode: -105, errorDescription: "NAME_NOT_RESOLVED", isMainFrame: true })).toBe(
			"NAME_NOT_RESOLVED",
		);
	});

	test("ignores a stopped load and a failed subframe", () => {
		expect(linkLoadError({ errorCode: -3, errorDescription: "ABORTED", isMainFrame: true })).toBeNull();
		expect(linkLoadError({ errorCode: -105, errorDescription: "NAME_NOT_RESOLVED", isMainFrame: false })).toBeNull();
	});

	test("refuses a link outside HTTPS before it creates a webview", () => {
		expect(linkUrlError("https://example.com")).toBeNull();
		expect(linkUrlError("http://example.com")).toBe("Trellis opens only HTTPS links.");
	});
});
